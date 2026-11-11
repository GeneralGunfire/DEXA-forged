-- =====================================================================
-- DEXA Forged: in-depth database content (Background and Build record sections)
-- Run ONCE in Supabase -> SQL Editor, after 20261111000000_database_record.sql. Safe to re-run.
--
-- Adds:
--   * log_tokens.scope: a token is either a 'log' token (timeline only) or a 'content' token
--     (writes db_content only). Existing tokens stay 'log'.
--   * db_content: one row per section shown on a record's Background or Build record tab
--     (or on the whole-estate page). Only the two team users can read or write it from the site;
--     the content-write Edge Function writes it with a content token.
-- =====================================================================

alter table public.log_tokens add column if not exists scope text not null default 'log';
alter table public.log_tokens drop constraint if exists log_tokens_scope_check;
alter table public.log_tokens add constraint log_tokens_scope_check check (scope in ('log', 'content'));

create table if not exists public.db_content (
  id uuid primary key default gen_random_uuid(),
  database_id uuid references public.databases (id) on delete cascade,   -- null = whole estate
  scope_key text generated always as (coalesce(database_id::text, 'estate')) stored,
  area text not null check (area in ('background', 'build', 'estate')),
  position integer not null default 100 check (position between 0 and 100000),
  title text not null check (char_length(title) between 1 and 200),
  summary text not null default '' check (char_length(summary) <= 2000),
  kind text not null default 'text' check (kind in ('text', 'table', 'queries', 'sources')),
  body text not null default '' check (char_length(body) <= 400000),
  collapsed boolean not null default true,
  written_by text not null default 'Claude Code',
  token_id uuid references public.log_tokens (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint db_content_estate_area check ((area = 'estate') = (database_id is null)),
  constraint db_content_unique unique (scope_key, area, title)
);
create index if not exists db_content_lookup_idx on public.db_content (scope_key, area, position);

alter table public.db_content enable row level security;
revoke all on public.db_content from anon;
drop policy if exists "team access" on public.db_content;
create policy "team access" on public.db_content for all to authenticated
  using (public.is_team()) with check (public.is_team());
