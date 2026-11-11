-- =====================================================================
-- DEXA Forged: read-only access for Claude Code
-- Run ONCE in Supabase -> SQL Editor, after 20261113000000_content_charts.sql. Safe to re-run.
--
-- Allows a third token scope, 'read', on public.log_tokens. A read token can only be used on the
-- forge-read Edge Function (SELECT only). The log-ingest and content-write functions refuse it,
-- because they accept only scope 'log' and scope 'content' respectively.
-- Existing tokens are not changed. No token is created here.
-- =====================================================================

alter table public.log_tokens drop constraint if exists log_tokens_scope_check;
alter table public.log_tokens add constraint log_tokens_scope_check check (scope in ('log', 'content', 'read'));
