# forged-content

`scripts/forged-content` writes in-depth sections to a Forged database record: the **Background** and **Build record** tabs, and a whole-estate page on the global Timeline. Each section is a collapsible block that opens to text, a searchable table or a block of read-only queries. It needs Node 18 or newer and no other dependencies.

## One-off setup (by hand)

1. Run `supabase/migrations/20261112000000_db_content.sql` in the Supabase SQL Editor (once).
2. Deploy the function: `supabase functions deploy content-write --no-verify-jwt --project-ref <your project ref>`. Redeploy `log-ingest` too, because it now refuses content tokens.
3. In Forged, open **Settings** and press **Create content token**. Copy it straight away; it is shown once and only its hash is stored.
4. Set two environment variables on the PC:

   ```
   setx FORGED_CONTENT_URL "https://<project-ref>.supabase.co/functions/v1/content-write"
   setx FORGED_CONTENT_TOKEN "<the content token>"
   ```

   The script reads these from the environment only. It never accepts them as arguments and never prints them.

A content token can only write content sections. It cannot write timeline entries, read anything or delete anything. A log token cannot write content. Revoke either on the Settings page.

## Use

```
forged-content --db public_hospital --area build --title "Tables and row counts" \
               --summary "Every table with its purpose and size." --kind table --csv-file tables.csv
forged-content --db public_hospital --area background --title "How it is used in real life" \
               --summary "Who runs it and why it matters." --body-file background.md --position 10 --open
forged-content --area estate --title "Port and instance registry" --body-file ports.md
```

It prints only the section id. Writing the same database, area and title again replaces that section, so a section can be corrected by running the command again.

| Option | Meaning |
| --- | --- |
| `--db` | Database slug, for example `public_hospital`. Leave out for `--area estate`. |
| `--area` | `background`, `build` or `estate`. |
| `--title`, `--summary` | The title and a short plain-words summary shown while the section is closed. |
| `--kind` | `text` (default), `table`, `queries` (shown as pre-formatted read-only query text) or `sources`. |
| `--body`, `--body-file` | The text. Light formatting only: `**bold**`, `*italic*`, `[text](https://link)`, `- ` lists, blank line for a new paragraph. |
| `--csv-file` | A CSV with a header row, sent as a table (up to 12 columns and 3,000 rows). |
| `--position`, `--open` | Order on the page (lowest first), and whether the section starts open. |

## What is refused

The same redaction check as the timeline runs on the title, summary, body and every table cell: no South African ID number, email address, phone number, connection string, `password=`, `pwd=`, `secret`, `token=`, `apikey`, long `Bearer` value, private key block or base64-looking string over 40 characters. Write counts, schemas, code lists and descriptions only. Never a patient-level row. If a section is refused, fix the text and send it again.
