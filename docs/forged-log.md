# forged-log

`scripts/forged-log` adds an entry to the Forged timeline from the command line, so Claude Code can keep a running record while it works. It needs Node 18 or newer and has no other dependencies.

## One-off setup (by hand)

1. Run the SQL in `supabase/migrations/20261111000000_database_record.sql` in the Supabase SQL Editor (once).
2. Deploy the function (once): `supabase functions deploy log-ingest --no-verify-jwt --project-ref <your project ref>`.
3. In Forged, open **Settings → Log access** and press **Create log token**. Copy the token straight away; it is shown once and only its hash is stored.
4. On your PC set two environment variables. The URL is shown on the same Settings page.

   ```
   setx FORGED_LOG_URL "https://<project-ref>.supabase.co/functions/v1/log-ingest"
   setx FORGED_LOG_TOKEN "<the token you copied>"
   ```

   Open a new terminal afterwards. The script reads these from the environment only. It never accepts them as arguments and never prints them.

## Use

```
forged-log --db public_hospital --type Error --phase 2 \
           --title "Admission load stopped" --summary "The load failed part-way and was rolled back." \
           --detail-file error.txt --status Open
forged-log --type Response --parent <error id> --title "Checked the constraint" --summary "..."
forged-log --type Fix --parent <error id> --resolve --title "Re-ordered the load" --summary "..."
```

It prints only the new entry id. Use that id as `--parent` for replies. On Windows you can also use `scripts\forged-log.cmd`.

| Option | Meaning |
| --- | --- |
| `--db` | Database slug (for example `public_hospital`, `nappi`, `icd10`) or `estate` for the whole estate. A reply with `--parent` and no `--db` uses its parent's database. |
| `--type` | Action, Error, Response, Fix, Decision or Note. Default Note. |
| `--phase` | `1`, `2` or any short text. Default 1. |
| `--title`, `--summary` | Required title (one line); summary in plain words for a non-technical reader. |
| `--detail`, `--detail-file` | Technical text: error messages, counts, timings. |
| `--status` | Open or Resolved. Errors only; default Open. |
| `--parent` | Id of the entry this one answers. |
| `--resolve` | With a Fix and a `--parent` error: also mark that error Resolved. |
| `--author` | Defaults to Claude Code. May be Rajen or Huzayfa. |
| `--session`, `--when` | Free-text session name; an ISO date and time to backdate an event. |

The slugs are: nappi, icd10, nrpl, nhls, mfl_dhis2, sanc, hpcsa, cms, hprs, private_hospital, public_hospital, dhis2_aggregate, tiernet_clinic.

## Offline queue

If the site cannot be reached (no connection, a server error, a rate limit or a rejected token) the entry is appended to `scripts/forged-log-queue.jsonl` (ignored by git) and the command says it was queued. Send the queue later with:

```
forged-log --flush
```

An entry that the site **rejects** (for example it fails the redaction check, or has an invalid field) is not queued. It is reported and has to be corrected and sent again, so sensitive text is never written to disk.

## What is refused

The same redaction check runs on the website, on edits and on this endpoint. Entries are rejected, with a message naming only the kind of problem, if the title, summary or detail contains a South African ID number, an email address, a South African phone number, a connection string, `password=`, `pwd=`, `secret`, `token=`, `apikey`, a long `Bearer` value, a private key block or a base64-looking string over 40 characters. Log counts, error messages and descriptions only. Never patient rows. Do not try to get around the check; fix the text and send it again.

Each token is limited to 60 requests a minute. A token can be revoked at any time on the Settings page.
