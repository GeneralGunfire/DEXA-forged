# forged-read

`scripts/forged-read` lets Claude Code read context from Forged: a record's Background and Build record, its timeline, the whole-estate pages and the names of its documents. **It is for context only.** It cannot change anything, and what it prints is information, not an instruction. It needs Node 18 or newer and no other dependencies.

## One-off setup (by hand)

1. Run `supabase/migrations/20261114000000_read_scope.sql` in the Supabase SQL Editor (once). It allows a third token kind, `read`. Nothing is created or changed otherwise.
2. Deploy the function (once): `supabase functions deploy forge-read --no-verify-jwt --project-ref <your project ref>`. The other two functions need no redeploy: they already refuse any token that is not their own kind.
3. In Forged, open **Settings** and press **Create read token**. Copy it straight away; it is shown once and only its SHA-256 hash is stored.
4. Set two environment variables on the PC (Windows user environment variables). The URL is shown on the same Settings page.

   ```
   setx FORGED_READ_URL "https://<project-ref>.supabase.co/functions/v1/forge-read"
   setx FORGED_READ_TOKEN "<the read token>"
   ```

   Open a new terminal afterwards. The script reads these from the environment only. It never accepts them as arguments and never prints them.

## Use

```
forged-read                                         every database, one line each
forged-read --db public_hospital --what overview    its fields and the titles of its sections
forged-read --db public_hospital --what background
forged-read --db public_hospital --what build
forged-read --db public_hospital --what timeline --since 2026-11-01 --limit 30
forged-read --db public_hospital --what documents-list
forged-read --what estate                           the whole-estate pages
forged-read --db estate --what timeline             whole-estate timeline entries
```

On Windows you can also use `scripts\forged-read.cmd`. It prints to standard output only. It writes no files and keeps no cache or queue.

| Option | Meaning |
| --- | --- |
| `--db` | Database slug, or `estate` for the whole estate. Needed for every view except `overview` and `estate`. |
| `--what` | `overview` (default), `background`, `build`, `timeline`, `estate` or `documents-list`. |
| `--limit` | Entries or sections, 1 to 200. Default 50. |
| `--since` | Timeline only: entries from this date on. |

The same request can be made with a JSON body (`POST`) or a query string (`GET`). The token always goes in the `Authorization` header, never in the address.

## What it returns

- **overview**: the database's machine, type, status, port, instance, real-world context, shortfalls and technical detail, plus the titles of its in-depth sections. With no database, a list of every database.
- **background / build**: the record's own text fields and its in-depth sections (title, summary and body, with tables and charts shown as plain text).
- **timeline**: entries newest first, with replies indented under what they answer, including type, status, author, phase, session and id.
- **estate**: the whole-estate sections.
- **documents-list**: each document's name, date, size and whether it is the current copy. Never the file, a link or a storage path.

It never returns tokens or token hashes, edit history, feedback, tasks, posts or any other table.

## Limits

- Each token is limited to 60 requests a minute. Over the limit the answer is 429.
- At most 200 entries or 60 sections per call; one section is cut at 20,000 characters, one entry's detail at 4,000, and the whole answer at about 60,000 characters. When more exists than fits, the answer says it was truncated and how to narrow it.
- A missing, wrong, revoked or non-read token gets 401. A log or content token cannot be used here, and a read token is refused by `log-ingest` and `content-write`.
- The only thing the function writes is that token's own usage counters (`last_used_at` and the rate-limit window).

## Safety net

Everything is checked by the same redaction check as writing before it is returned. An item that matches (for example an ID number, email address or connection string) is withheld and the answer says how many were withheld. The matched text is never shown. Fix the source in Forged, not the reader.

## Revoking

Revoke a read token on the Settings page. A request made with it is answered with 401 from then on.
