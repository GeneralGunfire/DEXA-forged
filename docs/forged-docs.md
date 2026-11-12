# forged-docs

`scripts/forged-docs` lets Claude Code put documents into Forged, find them and read their details, with a folder, tags and a reason on each. It needs Node 18 or newer and no other dependencies. **It cannot delete anything and it never changes a file in place.** A changed document is a new version; the old one stays as history.

## One-off setup (by hand)

1. Run `supabase/migrations/20261116000000_document_folders.sql` and then `supabase/migrations/20261117000000_docs_access.sql` in the Supabase SQL Editor (once each).
2. Deploy the function (once): `supabase functions deploy forge-docs --no-verify-jwt --project-ref <your project ref>`.
3. In Forged, open **Settings** and press **Create docs token**. Copy it straight away; it is shown once and only its SHA-256 hash is stored.
4. Set two environment variables on the PC (Windows user environment variables). The URL is shown on the Settings page.

   ```
   setx FORGED_DOCS_URL "https://<project-ref>.supabase.co/functions/v1/forge-docs"
   setx FORGED_DOCS_TOKEN "<the docs token>"
   ```

   Open a new terminal afterwards. The script reads these from the environment only. It never accepts them as arguments and never prints them.

## Use

```
forged-docs list                                    everything current
forged-docs list --db private_hospital              one database's documents
forged-docs list --db estate --folder "Originals 10 Nov 2026"
forged-docs list --db estate --history              include older versions
forged-docs get d:<id>                              details
forged-docs get d:<id> --out C:\scratch\docs        details, and save the file into that folder
forged-docs upload report.pdf --db estate --folder "Originals 10 Nov 2026" --tags original,final --reason "Official copy as supplied on 10 November"
forged-docs upload report_v2.pdf --db private_hospital --replaces d:<id of the current one> --reason "Last-visit figures corrected after the fix" --tags update
forged-docs update g:<id> --folder "Archive" --tags superseded
```

On Windows you can also use `scripts\forged-docs.cmd`.

| Option | Meaning |
| --- | --- |
| `--db` | A database slug, or `estate` for the general Documents tab. Needed for upload. |
| `--reason` | **Required on upload.** One sentence on why the document is being added or changed. |
| `--replaces` | The id of the current document this one supersedes. The old one is kept as history. |
| `--folder` | Folder on the general Documents tab only (`--db estate`). Database documents have no folder. |
| `--tags` | Up to ten short labels, separated by commas, for example `original,final` or `update,correction`. |
| `--name`, `--description`, `--date`, `--made-by` | Optional. The date defaults to today. Made-by defaults to Claude Code. |
| `--entry` | A timeline entry id to link a database document to. |

Every document also keeps the time it was added automatically.

## The standard way to work

- **The timeline is the main record.** Log what you did and found there, as before.
- **A document is made new, not edited.** When a fix makes a document out of date, upload the corrected version with `--replaces`, with a reason and the tag `update`. Do not try to alter an existing file or an existing document.
- Say in the reason what changed and why, and link it to the timeline entry that describes the change.

## Limits and safety

- Accepted files: PDF, Word (`.docx`), PNG and JPEG, up to 4 MB. The first bytes of each file must match its type.
- Names, folders, tags, reasons and descriptions pass the same redaction check as the timeline. A match is refused and never echoed.
- **The function cannot look inside a document.** Make sure a file holds no patient rows, ID numbers, names or contact details before you add it.
- Each token is limited to 60 requests a minute. A missing, wrong, revoked or non-docs token gets 401. A docs token is refused by `log-ingest`, `content-write` and `forge-read`, and the other tokens are refused here.
- The function never returns a storage path or link. `get --out` is the only thing that writes a file to disk, and only into the folder you name.
- If a current document with the same name already exists, an upload is refused (409) unless it says `--replaces`.

## Revoking

Revoke a docs token on the Settings page. A request made with it is answered with 401 from then on.
