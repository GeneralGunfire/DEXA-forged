# DEXA Forged: rules for Claude Code sessions

Forged is the internal admin site (React, Vite, Supabase, Vercel). It holds no patient data and must never hold any.

## Keeping the site up to date
- Log what you do on the timeline with `scripts/forged-log` (see `docs/forged-log.md`). It reads `FORGED_LOG_URL` and `FORGED_LOG_TOKEN` from the environment. Never print them.
  - Before starting work, log one Action. Log every error as an Error (status Open) with the exact message in `--detail`, then the attempt as a Response and the fix as a Fix, both with `--parent <error id>` (add `--resolve` on the Fix). Log decisions as Decision and results worth keeping as Note.
  - At the end of a session log one Note: what was done, what is open, what comes next. Run `node scripts/forged-log --flush`.
  - Tell the user in one line each time you log an Error or a Fix.
- Write in-depth Background and Build record content with `scripts/forged-content` (see `docs/forged-content.md`). It reads `FORGED_CONTENT_URL` and `FORGED_CONTENT_TOKEN`.
- If a document on a record is made out of date by your work, log a Note saying which and why. Do not edit the document.

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
