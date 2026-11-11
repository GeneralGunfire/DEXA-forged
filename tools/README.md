# tools/: estate publishing and verification scripts

Python scripts used to fill the Forged records for the SAHealth Machine A estate. They are code only. No query output, data extract or patient-level row is stored here, and none may be added.

## What is here
- `fp.py`: shared helpers. Read-only measurement (`mssql_rows`, `pg_rows`, `lite`, `csv_rows`, `file_facts`) and writing to Forged (`put`, `log`, `table`, `chart`).
- One publisher per record: `nappi_publish.py`, `icd10.py`, `nrpl.py`, `nhls.py`, `mfl.py`, `sanc.py`, `hpcsa.py`, `cms.py`, `hprs.py`, and `hospital.py <private|public>`.
- `estate.py`: the whole-estate pages.
- `verify_all.py` and `verify_nappi.py`: re-measure published figures against the live data and report PASS or FAIL.

Every number a publisher writes is measured when it runs. A publisher writes only through `scripts/forged-content` and `scripts/forged-log`. It sends no SQL to the Forged database, apart from the read-back in the two verify scripts.

## Connections: environment only
Nothing in these files holds a credential, token, connection string or password.

| Setting | Where it comes from | Default |
|---|---|---|
| `FORGED_LOG_URL`, `FORGED_LOG_TOKEN` | Windows user environment variables, read by `scripts/forged-log` | none |
| `FORGED_CONTENT_URL`, `FORGED_CONTENT_TOKEN` | Windows user environment variables, read by `scripts/forged-content` | none |
| `FORGED_REPO` | optional environment variable, the Forged repo folder | the parent of `tools/` |
| `SAH_DB_HOST` | optional environment variable, host for SQL Server and PostgreSQL | `localhost` |
| `SAH_PG_USER` | optional environment variable, PostgreSQL user | `postgres` |
| SQL Server login | Windows integrated authentication (`sqlcmd -E`); no password | n/a |
| PostgreSQL password | `psql -w` never prompts; the password comes from the user's `pgpass.conf` (`%APPDATA%\postgresql\`) or `PGPASSWORD`, both outside the repo | none |
| `supabase db query --linked` | the Supabase CLI login and the repo link under `supabase/.temp/` (git-ignored) | none |

Ports are fixed in the scripts because they describe the estate and are not secrets: private hospital 1433, public hospital 1438 (`PUBHOSPITAL`), HPRS 1436, HPCSA 1437, MFL/DHIS2 PostgreSQL 5432, CMS PostgreSQL 5433.

The source data lives in `C:\Database` (registries, handback and final-pass folders). The scripts only read it and never copy anything from it. Several scripts name that folder, because it is where the estate is. If it moves, edit the paths.

## Running
Run from the repo root so `scripts/forged-content` resolves. Run publishers one at a time, because the edge functions allow 60 requests a minute per token.

```
python tools/nhls.py
python tools/hospital.py private
NOLOG=1 python tools/estate.py      # republish pages without adding timeline entries
python tools/verify_all.py          # expects PASS on every line
```

`NOLOG=1` is honoured by `estate.py`, `hospital.py` and `hpcsa.py`, so a republish does not duplicate timeline entries.

## Rules
- Never commit output, extracts, screenshots, downloaded source files or logs. The scripts download source documents to a scratch folder outside the repo.
- Content must pass the redaction filter. Do not work around it.
- The scripts are measuring snapshots. Re-run a publisher after the data changes, then run `verify_all.py`.
