# DEXA Forged: rules for Claude Code sessions

Forged is the internal admin site (React, Vite, Supabase, Vercel). It holds no patient data and must never hold any.

## Keeping the site up to date
- Log what you do on the timeline with `scripts/forged-log` (see `docs/forged-log.md`). It reads `FORGED_LOG_URL` and `FORGED_LOG_TOKEN` from the environment. Never print them.
  - Before starting work, log one Action. Log every error as an Error (status Open) with the exact message in `--detail`, then the attempt as a Response and the fix as a Fix, both with `--parent <error id>` (add `--resolve` on the Fix). Log decisions as Decision and results worth keeping as Note. Phase 1 (the databases) is finished: work on Forged itself since then uses `--phase 1-2` ("between Phases 1 and 2"), and only real Phase 2 work (logins, connectors, mappings, adapters, the gateway) uses `--phase 2`.
  - At the end of a session log one Note: what was done, what is open, what comes next. Run `node scripts/forged-log --flush`.
  - Tell the user in one line each time you log an Error or a Fix.
- Write in-depth Background and Build record content with `scripts/forged-content` (see `docs/forged-content.md`). It reads `FORGED_CONTENT_URL` and `FORGED_CONTENT_TOKEN`.
- The timeline is the main record of everything you do. Routine work and fixes (a resolved error, a corrected value, a wording correction) go on the timeline only, and in a record's Background or Build record section when the user approves the wording. They do not need a new document.
- A new document is only for a BIG change: a new database or source, a rebuilt data set, a changed structure, or a change that makes much of an official document wrong. If you are not sure it is big, do not make one; ask. Then make it NEW in the same format as the existing documents, never edited: a new version (one more than the highest that exists), named by version, work and day, clearly marked as such on its first page, added with `scripts/forged-docs` (see `docs/forged-docs.md`; it reads `FORGED_DOCS_URL` and `FORGED_DOCS_TOKEN`) using `--replaces <id of the current one>`, `--reason`, `--tags` and `--entry <timeline entry id>`, plus a copy in a dated folder on the general Documents tab. The old version stays as history. Never alter an existing document or file in place.
- Read context from the site with `scripts/forged-read` (see `docs/forged-read.md`). It reads `FORGED_READ_URL` and `FORGED_READ_TOKEN`.

## Never
- Log or write patient rows, SA ID numbers, names, phone numbers, emails, passwords, tokens or connection strings. The site rejects them; fix the text and send again. Never try to get around the check.
- Use or ask for a Supabase service-role key. Never put secrets in the repo, the chat, screenshots or commit messages.
- Copy anything from `C:\Database` into this repository or push it anywhere. Treat those databases and files as read-only: SELECT and file reads only.
- Merge to `main` or change production settings without the user saying so. Work on branches; pushing a branch gives a Vercel preview.

## Working on the site
- British English. Plain words first, technical detail underneath. Keep the interface plain: black, white and grey, red only for problems.
- Every number you write comes from a live query or a file read in that session. Say "not established" instead of guessing.
- Database changes are SQL files in `supabase/` that the user runs in the Supabase SQL Editor (or you run with `supabase db query --linked` when asked). Never edit a migration that has already been run; add a new one.
- Run `npx vitest run`, `npx tsc -b` and `npm run build` before committing.
