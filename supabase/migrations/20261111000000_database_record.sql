-- =====================================================================
-- DEXA Forged: Database record (Timeline + Documents) and log access
-- Run ONCE in Supabase -> SQL Editor, after setup.sql. Safe to re-run.
-- Adds to the existing tables; nothing is dropped or rewritten.
--
-- Access: only the two accounts in public.team (Rajen, Huzayfa) can
-- select, insert, update or delete anything here. Anonymous visitors get nothing.
-- The log-ingest Edge Function uses the service role inside the function only.
-- =====================================================================

-- ---------- databases: slug + status (existing columns are reused:
--            machine, db_type = engine) ----------
alter table public.databases add column if not exists slug text;
alter table public.databases add column if not exists status text not null default '';
create unique index if not exists databases_slug_key on public.databases (slug) where slug is not null;

-- ---------- log tokens (only a hash is stored) ----------
create table if not exists public.log_tokens (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 80),
  token_hash text not null unique,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  window_start timestamptz,          -- rate limiting: start of the current minute
  window_count integer not null default 0
);

-- ---------- timeline ----------
create table if not exists public.timeline_entries (
  id uuid primary key default gen_random_uuid(),
  database_id uuid references public.databases (id) on delete cascade,   -- null = whole estate
  happened_at timestamptz not null default now(),
  type text not null check (type in ('Action', 'Error', 'Response', 'Fix', 'Decision', 'Note')),
  phase text not null default '1' check (char_length(phase) between 1 and 40),
  author text not null check (author in ('Rajen', 'Huzayfa', 'Claude Code')),
  title text not null check (char_length(title) between 1 and 200),
  summary text not null default '' check (char_length(summary) <= 5000),
  detail text not null default '' check (char_length(detail) <= 100000),
  status text check (status in ('Open', 'Resolved')),
  parent_id uuid references public.timeline_entries (id) on delete set null,
  session_label text not null default '' check (char_length(session_label) <= 120),
  created_at timestamptz not null default now(),
  created_via text not null default 'web' check (created_via in ('web', 'ingest')),
  created_by uuid default auth.uid() references auth.users (id),
  token_id uuid references public.log_tokens (id) on delete set null,
  -- status is only meaningful for errors
  constraint timeline_status_errors_only check (type = 'Error' or status is null)
);

create index if not exists timeline_db_time_idx on public.timeline_entries (database_id, happened_at desc);
create index if not exists timeline_time_idx on public.timeline_entries (happened_at desc);
create index if not exists timeline_status_idx on public.timeline_entries (status) where status is not null;
create index if not exists timeline_parent_idx on public.timeline_entries (parent_id);

create table if not exists public.timeline_entry_edits (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.timeline_entries (id) on delete cascade,
  edited_by uuid default auth.uid() references auth.users (id),
  edited_at timestamptz not null default now(),
  previous jsonb not null          -- the entry as it was before this edit
);
create index if not exists timeline_edits_entry_idx on public.timeline_entry_edits (entry_id, edited_at desc);

-- every change to an entry keeps the previous version (who, when, what it said)
create or replace function public.timeline_keep_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if to_jsonb(old) - 'created_at' is distinct from to_jsonb(new) - 'created_at' then
    insert into public.timeline_entry_edits (entry_id, edited_by, previous)
    values (old.id, (select auth.uid()), to_jsonb(old));
  end if;
  return new;
end;
$$;
revoke all on function public.timeline_keep_history() from public, anon, authenticated;

drop trigger if exists timeline_history on public.timeline_entries;
create trigger timeline_history after update on public.timeline_entries
  for each row execute function public.timeline_keep_history();

-- ---------- dated documents per database (replaced files stay as earlier copies) ----------
create table if not exists public.db_documents (
  id uuid primary key default gen_random_uuid(),
  database_id uuid not null references public.databases (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  document_date date not null default current_date,
  path text not null,                       -- file in the private forged-files bucket
  mime text,
  size bigint,
  is_current boolean not null default true,
  replaces_id uuid references public.db_documents (id) on delete set null,
  entry_id uuid references public.timeline_entries (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists db_documents_db_idx on public.db_documents (database_id, document_date desc);
create index if not exists db_documents_entry_idx on public.db_documents (entry_id);

-- ---------- row level security: the two team users only ----------
do $$
declare t text;
begin
  foreach t in array array['timeline_entries', 'timeline_entry_edits', 'db_documents', 'log_tokens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists "team access" on public.%I', t);
    execute format(
      'create policy "team access" on public.%I for all to authenticated using (public.is_team()) with check (public.is_team())',
      t
    );
  end loop;
end $$;

-- ---------- storage ----------
-- Files go in the existing PRIVATE bucket "forged-files" (created by setup.sql),
-- whose policy already allows only the team. Re-stated here so this file stands alone.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'forged-files', 'forged-files', false, 52428800,
  array[
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'video/mp4', 'image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'
  ]
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "forged files team" on storage.objects;
create policy "forged files team" on storage.objects
  for all to authenticated
  using (bucket_id = 'forged-files' and public.is_team())
  with check (bucket_id = 'forged-files' and public.is_team());

-- ---------- the 13 database cards (never duplicated) ----------
with v(slug, name, machine, engine, status) as (values
  ('nappi',            'NAPPI Medicine Codes',          'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('icd10',            'ICD-10 Diagnosis Codes',        'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('nrpl',             'NRPL Tariff Items',             'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('nhls',             'NHLS Lab Codes',                'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('mfl_dhis2',        'MFL and DHIS2 Facilities',      'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('sanc',             'SANC Nursing Register',         'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('hpcsa',            'HPCSA Practitioner Register',   'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('cms',              'CMS Medical Schemes',           'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('hprs',             'HPRS Patient Registry',         'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('private_hospital', 'Private Hospital',              'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('public_hospital',  'Public Hospital',               'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('dhis2_aggregate',  'DHIS2-style aggregate',         'Huzayfa''s laptop', 'PostgreSQL', 'Awaiting verification'),
  ('tiernet_clinic',   'TIER.Net-style clinic',         'Huzayfa''s laptop', 'SQLite',     'Awaiting verification')
)
-- first, give a slug to existing cards that already carry the same name
update public.databases d set slug = v.slug
from v where d.slug is null and lower(d.name) = lower(v.name)
  and not exists (select 1 from public.databases x where x.slug = v.slug);

insert into public.databases (name, slug, machine, db_type, status, created_by)
select v.name, v.slug, v.machine, v.engine, v.status, 'af1d6d0b-1068-4c5d-ac9c-f69870739367'
from (values
  ('nappi',            'NAPPI Medicine Codes',          'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('icd10',            'ICD-10 Diagnosis Codes',        'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('nrpl',             'NRPL Tariff Items',             'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('nhls',             'NHLS Lab Codes',                'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('mfl_dhis2',        'MFL and DHIS2 Facilities',      'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('sanc',             'SANC Nursing Register',         'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('hpcsa',            'HPCSA Practitioner Register',   'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('cms',              'CMS Medical Schemes',           'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('hprs',             'HPRS Patient Registry',         'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('private_hospital', 'Private Hospital',              'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('public_hospital',  'Public Hospital',               'Rajen''s PC',      'SQL Server', 'Phase 1 complete'),
  ('dhis2_aggregate',  'DHIS2-style aggregate',         'Huzayfa''s laptop', 'PostgreSQL', 'Awaiting verification'),
  ('tiernet_clinic',   'TIER.Net-style clinic',         'Huzayfa''s laptop', 'SQLite',     'Awaiting verification')
) as v(slug, name, machine, engine, status)
where not exists (
  select 1 from public.databases d where d.slug = v.slug or lower(d.name) = lower(v.name)
);
