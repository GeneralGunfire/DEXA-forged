-- DEXA Forged: complete database setup for the Database record, content and charts.
-- Run ONCE in Supabase -> SQL Editor, after setup.sql. Safe to re-run. Combines the three migrations in order.

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


-- Allow chart sections in db_content (bar, stacked and before-after charts written by content-write).
-- Run in the Supabase SQL Editor after 20261112000000_db_content.sql. Safe to re-run.
alter table public.db_content drop constraint if exists db_content_kind_check;
alter table public.db_content add constraint db_content_kind_check check (kind in ('text', 'table', 'queries', 'sources', 'chart'));

-- ===== data: timeline backfill (from the 11 source documents) =====
-- Timeline backfill, from the 11 source documents dated 10 November 2026
-- (SAHealth_Simulated_Sources_All_11_Documents.zip) plus the earlier Machine B record for the two partner databases.
-- Dates come from the documents (29 Sep, 24-27 Oct, 31 Oct, 4 Nov, 10 Nov). The time of day is not recorded, so it is a placeholder.
-- Safe to re-run: an entry with the same database and title is not added twice.

create or replace function pg_temp.tl(
  slug text, ts text, typ text, ph text, au text, ti text, su text, de text, st text, par uuid, sess text
) returns uuid language plpgsql as $f$
declare d uuid; found_id uuid; new_id uuid;
begin
  if slug is not null and slug <> 'estate' then
    select id into d from public.databases where databases.slug = tl.slug;
    if d is null then raise exception 'No database with slug %', slug; end if;
  end if;
  select id into found_id from public.timeline_entries
    where title = ti and database_id is not distinct from d limit 1;
  if found_id is not null then return found_id; end if;
  insert into public.timeline_entries
    (database_id, happened_at, type, phase, author, title, summary, detail, status, parent_id, session_label, created_by)
  values (d, ts::timestamptz, typ, ph, au, ti, su, coalesce(de, ''), st, par, sess,
          'af1d6d0b-1068-4c5d-ac9c-f69870739367')
  returning id into new_id;
  return new_id;
end $f$;

do $$
declare
  D constant text := 'Backfill from the 10 Nov 2026 source documents (time of day not recorded)';
  B constant text := 'Backfill from the earlier Machine B record (not in the 11-document pack)';
  e uuid;
begin
  -- ===================== whole estate =====================
  perform pg_temp.tl('estate','2026-10-25 08:00+02','Decision','1','Rajen','If a code set is a flat file in real life, it is a flat file here',
    'NAPPI, ICD-10 and NRPL are shared as files in the real world, so they are CSV files, not database tables. The gateway reads them directly.',
    'Format accuracy rule from the project brief.',null,null,D);
  perform pg_temp.tl('estate','2026-10-25 08:10+02','Action','1','Claude Code','Started the build: schemas for the registries written on 25 October',
    'The three code files and the schemas for the registry databases were created from a written build instruction. Most of these were marked "approximated" in the instruction, because the real designs are not public.',
    'Schemas dated 25 Oct 2026 for the nurse, practitioner, facility, scheme, laboratory and patient registries. No generating script or seed survives for the flat files.',null,null,D);
  perform pg_temp.tl('estate','2026-11-04 12:00+02','Note','1','Claude Code','First round of checks and documents (4 November)',
    'The first set of source documents was written. At that point none of the hospitals'' medicine, tariff, lab, staff or doctor numbers appeared in the national reference files.',
    'This is the "before" baseline that every 10 November comparison in the source documents uses.',null,null,D);
  perform pg_temp.tl('estate','2026-11-10 12:00+02','Action','1','Claude Code','Close-out pass: hospitals linked to the national registries and reference files',
    'On 10 November the hospitals were linked to the registries and aligned to the code files so the gateway has real matches and real misses to find. Every pass backed up first, ran in one transaction and was recounted afterwards. Random seeds are recorded.',
    E'Hospital patients linked to HPRS (private 500, public 1,200); doctors, nurses and staff linked to HPCSA and SANC; medicine, tariff, diagnosis and lab codes aligned to the code files; SA ID numbers rebuilt so they pass the check digit; about 3% of matched codes mistyped on purpose and every one recorded in a defects log.',null,null,D);
  perform pg_temp.tl('estate','2026-11-10 14:00+02','Note','1','Claude Code','Eleven source documents written, one per Machine A database',
    'Each document explains the real system in plain words, how our copy was built and checked, what is still not known, and what the gateway developers need to know.',
    'Documents 1 to 11 are dated 10 November 2026 and marked Final, Internal.',null,null,D);
  perform pg_temp.tl('estate','2026-11-10 14:10+02','Note','2','Claude Code','Open items handed to Phase 2',
    'Several things are deliberately left for the gateway phase: read-only database roles, code translation tables, crosswalks and adapters.',
    E'Examples: read-only roles for the PostgreSQL databases; scheme_code_mapping (empty on purpose); roll-up rule from detailed to 3-character diagnosis codes; hospital code crosswalks; gateway logins and row-level security for the hospitals.\nStill "not established": where the flat-file rows came from, and the generators and seeds of several first populations.',null,null,D);

  -- ===================== NAPPI =====================
  e := pg_temp.tl('nappi','2026-10-25 12:00+02','Action','1','Claude Code','Wrote the medicine code file from a build instruction',
    'A CSV of 77 medicine products, leaning towards antiretrovirals and other public-programme medicines. The instruction asked for about 200; 77 were delivered.',
    E'15 columns, 10-digit codes (read as a 7-digit product code plus a 3-digit pack code, our reading), no duplicates, all Active. No generating script or seed survives.',null,null,D);
  perform pg_temp.tl('nappi','2026-11-10 12:30+02','Action','1','Claude Code','Linked the hospitals'' medicine codes to the file',
    'Matched hospital products to the file by ingredient, strength and form and wrote its code into each hospital''s medicine table, so the gateway has real matches to test.',
    E'Private hospital: 27 of 92 products now in the file. Public hospital: 33 of 103. About 3% of matched codes mistyped on purpose. Before 10 November: none matched.',null,null,D);
  perform pg_temp.tl('nappi','2026-11-10 13:00+02','Note','1','Claude Code','Medicine file: final checks',
    'The file is tidy and consistent, but it cannot be compared with the real list because we do not hold it.',
    'Checked 10 Nov 2026: 77 rows, 15 columns, no duplicate codes, 10 digits on every row, 77 blanks all in effective_to. SHA-256 fingerprint recorded.',null,null,D);
  perform pg_temp.tl('nappi','2026-11-10 13:10+02','Error','1','Claude Code','Where the 77 rows came from is not recorded',
    'No source, licence or extraction date exists on the project computer. The file must never be described as the full or official NAPPI list.',
    E'Real NAPPI code length also "not established". MediKredit maintains the real product file (confirmed); the NAPPI Advisory Board governs it (partly confirmed).','Open',null,D);

  -- ===================== ICD-10 =====================
  perform pg_temp.tl('icd10','2026-10-25 12:00+02','Action','1','Claude Code','Wrote the diagnosis code file from a build instruction',
    'A CSV of 132 diagnosis codes following the structure of the national table (the Master Industry Table). The instruction asked for about 500.',
    E'14 columns, 9 chapters, 88 codes flagged as Prescribed Minimum Benefits and 44 not, release label MIT2024.1.',null,null,D);
  perform pg_temp.tl('icd10','2026-11-10 12:30+02','Action','1','Claude Code','Added all 132 codes to both hospitals'' code lists',
    'The hospitals now share the file''s codes, so the gateway has real matches. The public hospital also had its older diagnosis log filled in.',
    E'Public hospital: 18,740 rows added to the older diagnosis log, leaving 4,496 encounters (5.9%) without one on purpose. About 2% of public diagnosis codes planted as invalid or truncated (1,777 rows).',null,null,D);
  perform pg_temp.tl('icd10','2026-11-10 13:00+02','Note','1','Claude Code','The public hospital''s two diagnosis stores disagree',
    'On 12,652 of 71,287 encounters the two places a diagnosis is kept disagree on the first main diagnosis. This is accepted as realistic drift.',
    'The private hospital uses 3-character codes; the file lists longer ones, so a roll-up rule is needed (Phase 2).',null,null,D);
  perform pg_temp.tl('icd10','2026-11-10 13:10+02','Error','1','Claude Code','The release label MIT2024.1 cannot be verified',
    'The official publisher''s page lists releases dated 1 January 2014 and 16 March 2021, but not MIT2024.1. The origin of the 132 rows is also not recorded.',
    'The file must never be described as the full or official table.','Open',null,D);

  -- ===================== NRPL =====================
  perform pg_temp.tl('nrpl','2026-10-25 12:00+02','Action','1','Claude Code','Wrote the price list file from a build instruction',
    'A CSV of 81 priced items: 69 from the National Reference Price List (private sector) and 12 from the Uniform Patient Fee Schedule (public sector patient fees).',
    '11 columns, 17 provider groups, no duplicate codes. No generating script or seed survives.',null,null,D);
  perform pg_temp.tl('nrpl','2026-11-10 12:30+02','Action','1','Claude Code','Linked the hospitals'' tariff codes to the file',
    'Matched tariff items by description and copied the file''s item code into each hospital''s tariff table.',
    E'Private hospital: 6 of 10 tariff codes. Public hospital: 217 of 448 (48.4%). About 3% of matched public codes mistyped on purpose. Before 10 November: none matched.',null,null,D);
  perform pg_temp.tl('nrpl','2026-11-10 13:00+02','Error','1','Claude Code','Meaning of the item types M, N and R is not confirmed',
    'No source was found for what the modifier, note and rule item types mean. The meanings in the document are inferred from the file.',
    'Also not established: where the 81 rows came from. Regulations under the National Health Act cover reference price lists (Government Gazette 30110, 23 July 2007).','Open',null,D);

  -- ===================== NHLS =====================
  perform pg_temp.tl('nhls','2026-10-25 12:00+02','Action','1','Claude Code','Created the laboratory catalogue with its first 21 tests',
    'A SQLite database with four tables. One SQL script created the schema and the first 21 tests, including full blood count, CD4, HIV viral load and creatinine.',
    'Script about 8 KB. The header calls the schema "approximated".',null,null,D);
  perform pg_temp.tl('nhls','2026-10-26 12:00+02','Action','1','Claude Code','Expanded the catalogue to 68 tests',
    'A second script added the rest. It cannot create duplicate codes, and it sets the HIV viral load normal range to undetectable below 20 copies/mL.',
    E'68 tests in six disciplines (chemistry 29, microbiology 14, haematology 11, immunology 8, virology 5, anatomical pathology 1). The order and result tables are empty on purpose.',null,null,D);
  perform pg_temp.tl('nhls','2026-11-10 12:30+02','Action','1','Claude Code','Aligned the hospitals'' lab codes to the catalogue',
    'The catalogue itself was not changed. The hospitals were changed to carry its codes, and missing public results were filled in.',
    E'Private hospital: 24 of 40 tests. Public hospital: 94,355 of 135,988 result rows. Results added to 1,593 of 1,804 final orders (4,284 rows), 180 left empty on purpose. About 3% of matched codes mistyped on purpose.',null,null,D);
  perform pg_temp.tl('nhls','2026-11-10 13:00+02','Decision','1','Rajen','Use our own invented test codes, with LOINC and SNOMED CT only as mappings',
    'The real NHLS test codes are proprietary, so the catalogue uses invented ones. LOINC is never used as the key.',
    'Real catalogue reported at more than 2,400 tests (earlier research citing an NHLS procurement document). Only 21 of 68 tests carry a SNOMED CT code.',null,null,D);
  perform pg_temp.tl('nhls','2026-11-10 13:10+02','Error','1','Claude Code','Codes cannot be checked against the real NHLS list',
    'The real codes are not public, so the catalogue cannot be compared with them.','Marked "not established" in the source document.','Open',null,D);

  -- ===================== MFL / DHIS2 =====================
  perform pg_temp.tl('mfl_dhis2','2026-10-25 12:00+02','Action','1','Claude Code','Built the facility database in the standard DHIS2 layout',
    'A PostgreSQL database with 13 tables, following the standard DHIS2 layout plus one South African facility table.',
    'One SQL script created the tables and the first 32 organisation units and 10 facilities. There was no separate population script.',null,null,D);
  perform pg_temp.tl('mfl_dhis2','2026-11-10 12:30+02','Action','1','Claude Code','Added the hospitals and 25 clinics, and filled every code',
    'Added 27 facilities (the two hospitals and 25 feeder clinics) and an extra code column for each hospital''s own facility code, then filled every empty code.',
    E'Now 37 facilities, 59 organisation units (1 country, 9 provinces, 5 districts, 7 sub-districts, 37 facilities), all under Gauteng. Added 24 data elements, 34 monthly periods and one data set; reporting values stay empty. Seed recorded.',null,null,D);
  perform pg_temp.tl('mfl_dhis2','2026-11-10 13:00+02','Decision','1','Rajen','Keep each hospital''s own facility code beside the national one',
    'The hospitals'' own codes are kept in alternative_code so the code mismatch is real, and no separate translation table was built.',
    'A facility can be known by four identifiers: facility_uid, national_facility_id, dhis2_org_unit_code and alternative_code.',null,null,D);
  perform pg_temp.tl('mfl_dhis2','2026-11-10 13:10+02','Error','1','Claude Code','The partner''s DHIS2 reference list has not been matched',
    'The partner''s DHIS2-style database, with its own list of data elements, is not on this computer, so ours was not compared with it. The 24 elements and 34 periods are examples we chose.',
    'Also open: a read-only database role (Phase 2).','Open',null,D);

  -- ===================== SANC =====================
  perform pg_temp.tl('sanc','2026-10-25 23:45+02','Action','1','Claude Code','Created the nursing register schema',
    'Three tables for nurses, their registrations and where they have practised, following the Nursing Council regulation that prescribes what the register must hold.',
    'SQL script about 3 KB.',null,null,D);
  perform pg_temp.tl('sanc','2026-10-26 00:03+02','Action','1','Claude Code','Populated the register with 3,500 invented nurses',
    'The population was scaled from the real register''s 265,877 nurses and midwives at the end of 2024. All names and numbers are made up.',
    'A 3 MB script of 10,500 insert statements in 53 transactions. The generator that wrote it is not on this computer, so it cannot be reproduced exactly.',null,null,D);
  perform pg_temp.tl('sanc','2026-10-27 12:00+02','Action','1','Claude Code','Marked about 4% of nurses as suspended',
    'So the gateway can be tested on spotting a suspended nurse. The rate and reasons are our own choice, not real figures.',
    'Python script, seed 20261027. 140 suspended: RN 77, EN 31, ENA 25, CS 4, SPEC 3.',null,null,D);
  perform pg_temp.tl('sanc','2026-11-10 12:30+02','Action','1','Claude Code','Repaired IDs, added midwife registrations and linked hospital staff',
    'Every nurse now has a valid SA ID number. Hospital staff were linked to register entries and practice history was added.',
    E'3,640 registrations (140 midwife), 5,830 practice locations, 1,911 nurses with moves. 167 hospital staff linked, 162 resolve, 5 mistyped on purpose, 15 linked nurses suspended. 106 hospital staff renamed to match the register (accepted design choice). Seeds 20261111 and 20261113.',null,null,D);
  perform pg_temp.tl('sanc','2026-11-10 13:10+02','Error','1','Claude Code','The generator and seed for the 3,500 nurses are not on this computer',
    'The population cannot be reproduced exactly.','Marked "not established".','Open',null,D);

  -- ===================== HPCSA =====================
  perform pg_temp.tl('hpcsa','2026-10-25 23:42+02','Action','1','Claude Code','Created the practitioner register schema',
    'Five tables: boards, practitioners, registrations, qualifications and practice addresses. No real HPCSA design is public, so every name is our own.',
    'T-SQL script about 5.6 KB, header "approximated schema". Runs on its own SQL Server instance and port.',null,null,D);
  perform pg_temp.tl('hpcsa','2026-10-26 00:03+02','Action','1','Claude Code','Populated the register with 2,500 invented practitioners',
    'Scaled from the real register''s 2023/24 figure of 181,981, which the annual report does not clearly say is the whole register.',
    'A 3 MB script of 10,000 insert statements in 20 transactions. Generator not on this computer.',null,null,D);
  perform pg_temp.tl('hpcsa','2026-11-10 12:30+02','Action','1','Claude Code','Added valid IDs, second boards and address history, and linked hospital doctors',
    'Every practitioner has a valid SA ID. 62 have a second board and 62 an earlier address. Hospital doctors were linked to council records.',
    E'2,562 registrations. 248 practitioners are not simply Active (suspended, cancelled, removed or overdue). Linked: 57 of 72 public and 23 of 30 private doctors. Seeds 20261111 to 20261113.',null,null,D);
  perform pg_temp.tl('hpcsa','2026-11-10 13:10+02','Error','1','Claude Code','The generator and seed for the 2,500 practitioners are not on this computer',
    'The population cannot be reproduced exactly. No hospital doctor that resolves is suspended.','Marked "not established".','Open',null,D);

  -- ===================== CMS =====================
  perform pg_temp.tl('cms','2026-10-25 12:00+02','Action','1','Claude Code','Created the medical schemes schema',
    'Four tables for schemes, plan options, members and claims. The Council publishes no member data model, so every column name is our own.',
    'PostgreSQL script about 5 KB, header "approximated schema". Own instance on port 5433.',null,null,D);
  perform pg_temp.tl('cms','2026-10-26 12:00+02','Action','1','Claude Code','Populated 8,000 invented members',
    'Scaled from about 8.9 million real beneficiaries, with scheme-specific member number formats.',
    'A 5.4 MB script of 12,302 insert statements in one transaction. Generator not on this computer.',null,null,D);
  perform pg_temp.tl('cms','2026-11-10 12:30+02','Action','1','Claude Code','Linked 454 members to private-hospital patients and updated the scheme list',
    'Members were tied to hospital patients by name, birth date and member number. About 7% of their numbers are mistyped or out of date on purpose (33 deliberate errors). Added SAMWUMED and Keyhealth, and swapped the unverified Aetna for Medshield.',
    'Now 10 schemes, 40 options. The CMS 2025/26 annual report lists 70 registered schemes (16 open, 54 restricted) at 31 March 2026. Seed 20261110.',null,null,D);
  perform pg_temp.tl('cms','2026-11-10 13:00+02','Decision','1','Rajen','No SA ID number on any scheme member',
    'On purpose, so the gateway has to match on names, birth dates and member numbers.','',null,null,D);
  perform pg_temp.tl('cms','2026-11-10 13:10+02','Error','1','Claude Code','Real CMS registration numbers of the seeded schemes are not confirmed',
    'The numbers and dates of the three added schemes are synthetic placeholders.','The database also uses WIN1252 encoding, accepted as a realistic mismatch.','Open',null,D);

  -- ===================== HPRS =====================
  perform pg_temp.tl('hprs','2026-10-26 12:00+02','Action','1','Claude Code','Created the patient registry and loaded 15,000 invented patients',
    'A lookup and verification registry in the style of the national Health Patient Registration System. Gauteng-weighted (85.3% of patients).',
    'A 16 MB script of 57,045 insert statements in 114 transactions. Generator not on this computer.',null,null,D);
  e := pg_temp.tl('hprs','2026-10-31 12:00+02','Error','1','Claude Code','The registry''s own number was confused with the SA ID',
    'The HPRN must be the registry''s own number and never the 13-digit ID. The first build did not keep them apart.','','Resolved',null,D);
  perform pg_temp.tl('hprs','2026-10-31 12:30+02','Fix','1','Claude Code','Added the HPRN, verification, duplicate and sync columns',
    'One structural pass added four columns, a unique index that stops two patients sharing an HPRN while allowing empty ones, and checks on the allowed values. A full backup came first.',
    '',null,e,D);
  perform pg_temp.tl('hprs','2026-11-04 12:00+02','Decision','1','Rajen','The HPRN is the canonical identifier column',
    'Decided 4 November. The 12-digit HPRN is our own design; the real format is not published.','',null,null,D);
  perform pg_temp.tl('hprs','2026-11-10 12:30+02','Action','1','Claude Code','Made every SA ID valid and linked 1,500 patients to the hospitals',
    'Repaired check digits, rebuilt IDs from birth date and sex, and corrected 17 future birth dates. 1,500 patients now exist in both the registry and a hospital.',
    E'12,045 valid IDs and 150 planted mismatches. 14,799 cross-references: hospital 1,502, scheme 405, laboratory 847. Seeds 20261110 to 20261112.',null,null,D);
  perform pg_temp.tl('hprs','2026-11-10 13:10+02','Error','1','Claude Code','Older documents still call mpi_id the HPRN',
    'A documentation task: earlier documents use the wrong column name.','','Open',null,D);

  -- ===================== Private hospital =====================
  perform pg_temp.tl('private_hospital','2026-09-29 12:00+02','Action','1','Claude Code','Wrote the blueprint and built the schema',
    'A written blueprint described every table first. Numbered scripts then created 20 schemas, 197 tables, 375 foreign keys and the security layer.',
    'A comparison tool matched the live database to the blueprint with no differences, and a smoke test pushed one patient through to a payment and rolled back.',null,null,D);
  perform pg_temp.tl('private_hospital','2026-10-24 12:00+02','Action','1','Claude Code','Loaded a year of history',
    'A large script generated about 4,200 patients, 9,500 inpatient and 38,000 outpatient visits.',
    'It uses the database''s own random function with no seed, so a re-run would give different people.',null,null,D);
  perform pg_temp.tl('private_hospital','2026-10-26 12:00+02','Action','1','Claude Code','Corrected IDs, planted deliberate faults and filled 46 empty tables',
    'Rewrote invalid ID numbers, fixed age and sex inconsistencies, set deaths and then planted small deliberate faults. A second script filled 46 empty tables and can be re-run to the same result.',
    'Fixed seed 20261026.',null,null,D);
  perform pg_temp.tl('private_hospital','2026-10-31 12:00+02','Action','1','Claude Code','Re-applied seasonality and ran a realism audit',
    'Measured each fault rate against benchmark ranges set in our own audit. These are plausible targets, not published figures.','',null,null,D);
  perform pg_temp.tl('private_hospital','2026-11-10 12:30+02','Action','1','Claude Code','Close-out: linked to the registry, councils and code files',
    'Linked 500 patients to the national registry and the hospital''s doctors and nurses to their councils, recalculated account totals, moved encounters dated before birth and aligned code lists.',
    E'Doctors 23 of 30 and nurses 20 of 26 resolve. 253 visits dated before birth were moved, with every connected table. Seeds 20261111 to 20261117.',null,null,D);
  perform pg_temp.tl('private_hospital','2026-11-10 13:00+02','Note','1','Claude Code','Private hospital: final figures',
    'The clean control. Every table has a key and all 375 relationships are enforced, but small deliberate faults remain.',
    '197 tables, 4,218 patients, 47,465 visits, about 1.89 million rows, 61 tables empty by design.',null,null,D);
  perform pg_temp.tl('private_hospital','2026-11-10 13:10+02','Error','1','Claude Code','Last-visit dates on patients were not recalculated after moving visits',
    '14 patients differ from their latest visit and 18 have none.','Left as is and documented.','Open',null,D);

  -- ===================== Public hospital =====================
  perform pg_temp.tl('public_hospital','2026-09-29 12:00+02','Action','1','Claude Code','Built the schema, messy on purpose',
    'Four scripts created the schemas, 108 tables, 7 foreign keys and 7 indexes. The script states that the mess is deliberate.',
    '100 tables are the legacy system (dbo) and 8 are a tidier layer (his). 35 of 108 tables have no key and 151 columns look like links that nothing enforces.',null,null,D);
  perform pg_temp.tl('public_hospital','2026-10-25 12:00+02','Action','1','Claude Code','Populated the database',
    'Twenty-four part scripts joined into one file, loaded in 500-row transactions so a failed chunk is reported and the run continues. The legacy tables hold text dates, string money and free text.',
    'Each part was first run on a scratch database. No seed recorded for the first population.',null,null,D);
  perform pg_temp.tl('public_hospital','2026-10-31 12:00+02','Action','1','Claude Code','Re-applied seasonality, removed duplicates and ran a realism audit',
    'Seasonality was re-applied and duplicate patients removed, then each fault rate was measured.','',null,null,D);
  perform pg_temp.tl('public_hospital','2026-11-10 12:30+02','Action','1','Claude Code','Close-out: linked 1,200 patients and aligned the code lists',
    'Linked to the national registry, rebuilt SA IDs so every SA-type ID passes the check digit, aligned medicine, tariff, diagnosis and lab codes, added gastro seasonality, raised unbilled visits to a stated 45% target and filled lab results with a 10% gap.',
    E'1,086 of the linked patients share the SA ID. 0 failures among 5,407 SA-type IDs. Medicine 33 of 103, tariff 217 of 448, 94,355 lab result rows. 1,777 diagnosis rows (2.00%) carry a non-local code, accepted.',null,null,D);
  perform pg_temp.tl('public_hospital','2026-11-10 13:00+02','Note','1','Claude Code','Public hospital: final figures',
    'Built to be messy. A legacy system with a newer layer on top.',
    '108 tables, 6,716 patients, 75,783 visits, about 1.71 million rows. Only 36.3% of visits have a charge; 4,496 visits have no diagnosis log row. Nothing is encrypted, masked or classified, on purpose.',null,null,D);
  perform pg_temp.tl('public_hospital','2026-11-10 13:10+02','Error','1','Claude Code','The seed for the first population was not recorded',
    'The first population cannot be reproduced exactly. The planned fault rates are borrowed from a Western Cape study and are not measured for this hospital.',
    '','Open',null,D);

  -- ===================== Machine B (partner''s laptop): earlier record only =====================
  perform pg_temp.tl('dhis2_aggregate','2026-10-30 10:00+02','Action','1','Huzayfa','Built and populated the DHIS2-style aggregate database',
    'A PostgreSQL database of monthly reported totals (not patient rows) for an ART programme, on the partner''s laptop.',
    E'17 tables populated, 11 empty on purpose. 29,596 data values, 18 periods, 22 organisation units (10 Gauteng facilities), 120 completed monthly returns. Reachable through the gateway only.',null,null,B);
  perform pg_temp.tl('dhis2_aggregate','2026-10-30 12:00+02','Error','1','Huzayfa','Queries fail: the schema search path is wrong',
    'The tables can be seen but queries fail. The partner needs to fix this.','search_path misconfiguration. Partner fix pending.','Open',null,B);
  perform pg_temp.tl('tiernet_clinic','2026-10-30 14:00+02','Action','1','Huzayfa','Built and populated the TIER.Net-style clinic database',
    'A SQLite database of HIV treatment patients with visits, regimens, viral loads and outcomes, on the partner''s laptop.',
    E'13 tables populated, 12 empty on purpose. 38,521 rows, 3,515 patients (3,380 real plus 135 planted duplicates), 18,799 visits. Six counted defects planted.',null,null,B);
  perform pg_temp.tl('tiernet_clinic','2026-10-30 16:00+02','Error','1','Huzayfa','Some expected tables may be missing from the clinic database',
    'The partner has to confirm the tables against the build specification.','Partner to confirm schema.','Open',null,B);
end $$;

-- ===== data: Background and Shortfalls for all 13 databases =====
-- Background ("Real-world context") and Shortfalls for all 13 database cards.
-- Machine A (11 cards) is written from the 11 source documents dated 10 November 2026.
-- Machine B (2 cards) comes from the earlier Machine B record plus web research, because it is not in that pack.
-- Re-running replaces these two fields.

update public.databases set
background = $b$**In real life.** NAPPI gives every medicine and medical product sold in South Africa a unique number, used on prescriptions, dispensing records and scheme claims. MediKredit maintains the product file (confirmed). A NAPPI Advisory Board governs it (partly confirmed). It is shared as a licensed product file that users load, not as a live service. See [Wikipedia: NAPPI](https://en.wikipedia.org/wiki/National_Pharmaceutical_Product_Index).

**In the simulation.** A plain CSV of 77 products (15 columns, 10-digit codes, no duplicates), leaning towards antiretrovirals and other public-programme medicines. It was written on 25 October 2026 from a build instruction that asked for about 200. On 10 November the hospitals were linked to it: 27 of the private hospital's 92 products and 33 of the public hospital's 103 now appear in it, and about 3% of matched codes are mistyped on purpose.$b$,
shortfalls = $b$- The source, licence and extraction date of the 77 rows are not recorded, so it must never be called the official list.
- The real code length is not established. Our 10 digits are read as a 7-digit product code plus a 3-digit pack code, which is our reading.
- The real list is far larger, so about two thirds of hospital products will not be found.
- There is no generating script or seed, so the file cannot be reproduced exactly.$b$
where slug = 'nappi';

update public.databases set
background = $b$**In real life.** ICD-10 is the international list of diseases. South Africa's private healthcare industry uses a version called the Master Industry Table, which adds detail such as a flag for Prescribed Minimum Benefits (conditions every scheme must cover by law). The National Department of Health publishes it as downloadable Excel and CSV files. The page lists versions dated 1 January 2014, change files from 2014 and a 2021 Excel file dated 16 March 2021 (confirmed).

**In the simulation.** A plain CSV of 132 codes with 14 columns across 9 chapters. 88 are flagged as PMB and 44 are not. It was written on 25 October 2026. On 10 November every code was added to both hospitals' own code lists, and the public hospital's older diagnosis log was filled in, leaving 4,496 encounters (5.9%) without a row on purpose. About 2% of public diagnosis codes are invalid or truncated on purpose.$b$,
shortfalls = $b$- The real table has tens of thousands of codes. Ours has 132, so most real diagnoses will not be found.
- The release label MIT2024.1 does not appear among the releases on the official page, and the origin of the rows is not recorded.
- The private hospital uses 3-character codes and the file lists longer ones, so a roll-up rule is needed (Phase 2).
- The public hospital's two diagnosis stores disagree on the first main diagnosis for 12,652 encounters. This is accepted as realistic drift.
- Our columns follow what a published table carries, not the official layout document, which was not opened.$b$
where slug = 'icd10';

update public.databases set
background = $b$**In real life.** Every billed service has a code and a reference price. Private medical aids use the National Reference Price List (NRPL). Public hospitals charge patients by the Uniform Patient Fee Schedule (UPFS), which sets fees by means-tested category. Regulations under the National Health Act cover the determination and publication of reference price lists. Claims to schemes carry NRPL, ICD-10 and NAPPI codes.

**In the simulation.** A plain CSV of 81 priced items (11 columns): 69 NRPL rows and 12 UPFS rows, across 17 provider groups. Written on 25 October 2026. On 10 November the hospitals were linked: 6 of the private hospital's 10 tariff codes and 217 of the public hospital's 448 now match, and about 3% of matched public codes are mistyped on purpose.$b$,
shortfalls = $b$- The source of the 81 rows is not established, so it must never be called the official list.
- The meanings of item types M (modifier), N (note) and R (rule) are inferred from the file, not confirmed.
- The real lists are far larger. Laboratory, pharmacy, blood, mortuary, physiotherapy and bed-day items have no equivalent and keep their own codes.
- The scheme code translation table is empty by design (Phase 2).
- Some reporting says the NRPL was legally challenged, and its current standing was not confirmed in the research.$b$
where slug = 'nrpl';

update public.databases set
background = $b$**In real life.** The National Health Laboratory Service (NHLS) runs the public laboratory service and tests samples for public hospitals and clinics. A published study of its turnaround times names the laboratory information system as TrakCare and describes a national network with a central data warehouse. Earlier research put the real catalogue at more than 2,400 tests and named LOINC and SNOMED CT as mapping standards.

**In the simulation.** One SQLite file with 4 tables. The catalogue holds 68 tests in six disciplines, with LOINC codes on all 68 and SNOMED CT on 21. The three order and result tables are empty on purpose. A schema and 21 tests were written on 25 October 2026, and the catalogue was expanded to 68 on 26 October. On 10 November the hospitals were aligned to it: 24 of 40 private tests and 94,355 of 135,988 public result rows now carry a catalogue code.$b$,
shortfalls = $b$- The real NHLS test codes are proprietary, so the codes here are invented and cannot be checked against the real list.
- 68 tests against a real catalogue of more than 2,400 is about 2.8%.
- There are no orders or results here. This is a catalogue, not a record of real tests.
- Units differ on purpose between sources, for example creatinine in mmol/L in the private hospital and µmol/L here.
- Only 21 of 68 tests have a SNOMED CT code.$b$
where slug = 'nhls';

update public.databases set
background = $b$**In real life.** The Master Facility List (MFL) is the national register of public and private health facilities. Each has a unique ID, a name and a sector, and public facilities have a province and a district (from the Department of Health user guide, version 1.2.4). DHIS2 is the District Health Information Software used for routine facility reporting, and its facility tree is the agreed list of public facilities.

**In the simulation.** A PostgreSQL database in the standard DHIS2 layout, 13 tables, 6 of which hold data. 37 facilities in Gauteng inside a tree of 59 organisation units (1 country, 9 provinces, 5 districts, 7 sub-districts). Facility names are real public hospital and clinic names, and every other detail is simulated. Written on 25 October 2026; on 10 November the two hospitals and 25 feeder clinics were added, every code was filled, and 24 data elements, 34 monthly periods and one data set were added. A facility can be known by four identifiers.$b$,
shortfalls = $b$- 37 Gauteng facilities stand in for a national register of thousands.
- There is no reporting data: the datavalue table is empty.
- The partner's DHIS2-style database, with its own list of data elements, is not on this computer, so ours was not matched to it.
- The standard DHIS2 layout was not checked table by table against the current release.
- No read-only database role exists yet (Phase 2).$b$
where slug = 'mfl_dhis2';

update public.databases set
background = $b$**In real life.** To work as a nurse in South Africa you must be on the Nursing Council register and renew your certificate every year. At 31 December 2024 the register held 265,877 nurses and midwives: 157,097 registered, 49,054 enrolled and 59,726 auxiliary (confirmed from the Council's growth table). Regulation R.195 says what the register must hold, including name, ID or passport, category, first registration date, qualification, certificate number and the date and reason for any suspension.

**In the simulation.** One SQLite file with 3 tables: 3,500 invented nurses, 3,640 registrations and 5,830 practice locations. Written on 25 and 26 October 2026, with about 4% suspended on 27 October (140 nurses: RN 77, EN 31, ENA 25, CS 4, SPEC 3). On 10 November every ID was repaired, 167 hospital staff were linked, and practice history was added for 1,911 nurses.$b$,
shortfalls = $b$- 3,500 nurses against 265,877. The suspension rate, reasons and proportions are our own choice, not real figures.
- Midwife and specialist are separate categories here. The Council's growth table counts midwives inside other groups, and the regulation does not list a specialist category.
- 106 hospital staff were renamed to match the register. This is an accepted design choice.
- The generator that wrote the population and its seed are not on this computer.
- A file has no access control and no protection against two programs writing at once.$b$
where slug = 'sanc';

update public.databases set
background = $b$**In real life.** Registration with the Health Professions Council is legally required to practise a health profession, and failing to register is a criminal offence (from the Council's 2024 annual report). Practitioners are organised into professional boards and renew every year. The annual report gives 181,981 for 2023/24, but the text does not make clear whether that is the whole register, so it was used only as a scaling anchor.

**In the simulation.** SQL Server on its own instance and port, so the gateway treats the regulator as a separate organisation. 5 tables with 2,500 invented practitioners, 2,562 registrations and 11 boards. Written on 25 and 26 October 2026. On 10 November every practitioner got a valid ID, 62 got a second board and 62 an earlier address, and hospital doctors were linked (57 of 72 public and 23 of 30 private). 248 practitioners are not simply Active.$b$,
shortfalls = $b$- No HPCSA data dictionary is public, so every table, column, board code, status name and registration number format is our own design.
- All practitioners practise in Gauteng, and the status mix is our own choice.
- No suspended hospital doctor resolves, because every linked doctor is Active.
- The generator and seed for the population are not on this computer.
- A read-only login exists, but there is no database encryption, masking or audit.$b$
where slug = 'hpcsa';

update public.databases set
background = $b$**In real life.** The Council for Medical Schemes lists 70 registered schemes (16 open, 54 restricted) at 31 March 2026, with about 8.9 million beneficiaries (CMS 2025/26 annual report). An open scheme accepts any member of the public. A restricted scheme serves one group, such as the employees of one employer. The Council publishes no member data model, and a scheme's member number has no national format.

**In the simulation.** A PostgreSQL database on its own instance with 4 tables: 10 schemes, 40 options and 8,000 invented members. Written on 25 and 26 October 2026. On 10 November 454 members were tied to private-hospital patients (about 7% of their numbers mistyped on purpose), SAMWUMED and Keyhealth were added, and Medshield replaced the unverified Aetna. No member has an SA ID number, on purpose.$b$,
shortfalls = $b$- 10 schemes against 70, and member counts and mix are our own choice, not real market shares.
- Because no member has an SA ID, the gateway has to match on names, birth dates and member numbers.
- The real registration numbers of the seeded schemes are not confirmed, and three are synthetic placeholders.
- The scheme code translation table is empty by design (Phase 2). The database uses WIN1252 encoding, accepted as a realistic mismatch.
- No read-only role exists yet, SSL is off and no logging is switched on.$b$
where slug = 'cms';

update public.databases set
background = $b$**In real life.** The Health Patient Registration System (HPRS) is the National Department of Health's patient registry. It exists, is linked to the laboratory service and issues a Master Patient Index number (confirmed by a written parliamentary reply, question NW2717, 15 September 2022). That reply reported 63,241,201 people registered at the point of care and 3,150 public facilities (3,089 primary care and 61 hospitals) as at 29 August 2022, and says some may have died or left the country.

**In the simulation.** A lookup and verification registry with no clinical data, on its own SQL Server instance. 15,000 invented patients across 4 tables (59,799 rows), weighted to Gauteng (85.3%). The HPRN is our own 12-digit number and never the SA ID. On 31 October the structure was fixed to keep them apart, and on 10 November every SA ID was made valid and 1,500 patients were linked to the hospitals.$b$,
shortfalls = $b$- 15,000 patients against tens of millions. The real design, including the HPRN shape and how duplicates are flagged, is not public. The simulation reproduces documented behaviour, not hidden design.
- The mix of missing, duplicate, unverified and failed records is our own choice. Duplicates are flags only: of 450 flagged, only 13 also have record status Duplicate.
- Only the linked subset has hospital, scheme and laboratory numbers.
- Every patient has one mobile number and one address, so the history columns are unused.
- Older documents still call mpi_id the HPRN, which is a documentation task.$b$
where slug = 'hprs';

update public.databases set
background = $b$**In real life.** South Africa's private hospital groups include Netcare, Mediclinic and Life Healthcare. None publishes its tables or engine, so the "private hospital" is our own framing of that archetype, and every table and column name is our own. Care is paid through medical schemes, so every claim carries ICD-10, NAPPI and tariff codes.

**In the simulation.** The clean control: 197 tables in 20 schemas, 375 enforced foreign keys, 4,218 patients, 47,465 visits and about 1.89 million rows. Built from a blueprint on 29 September 2026, loaded on 24 October, corrected and given 46 more tables of data on 26 October, audited for realism on 31 October and closed out on 10 November. It is still not perfect: account totals, diagnoses, codes and ID numbers carry small deliberate faults. 500 patients are linked to the national registry.$b$,
shortfalls = $b$- One hospital with one facility, so a group-level patient master across sites is not exercised.
- The error rates are targeted ranges set in our own audit, not published figures.
- It keeps its own diagnosis, product, tariff and laboratory codes. Only 5 of its 75 distinct diagnosis codes appear in the national file, which mostly holds longer codes.
- 253 visits dated before birth were moved. Last-visit dates were not recalculated, so 14 patients differ from their latest visit and 18 have none.
- 61 tables are empty by design, and the base load has no recorded seed so it cannot be reproduced.$b$
where slug = 'private_hospital';

update public.databases set
background = $b$**In real life.** Public hospital data is older and messier. The central patient index is planned as one file per patient per facility, but duplicates persist (earlier project research). The planned fault rates here are borrowed from a Western Cape study, according to the defects file, and are not figures for this hospital. A daily laboratory import is aspirational, not universal.

**In the simulation.** Built to be messy, as a legacy system with a newer layer on top: 108 tables, of which 100 are the old system (dbo) and 8 a tidier layer (his). 35 tables have no key, only 7 relationships are declared, and 151 more columns look like links that nobody enforced. 6,716 patients, 75,783 visits and about 1.71 million rows. Schema 29 September 2026, population 25 and 26 October, realism fix 31 October, and linking of 1,200 patients to the national registry on 10 November. Only 36.3% of visits have a charge.$b$,
shortfalls = $b$- It shows what a messy source looks like. It does not describe any named hospital, and no real hospital schema was used.
- One hospital only. There is no patient without a visit, and no lab result row is ever blank, which a real feed would not guarantee.
- Billing is a stated target, 45% of visits unbilled by design, not measured from a real hospital.
- Gastro seasonality was created by swapping diagnoses, and the private hospital has none.
- Nothing is encrypted, masked or classified, and the seed for the first population is not recorded.$b$
where slug = 'public_hospital';

update public.databases set
background = $b$**In real life.** DHIS2 is the open-source platform that districts and provinces use to collect routine health statistics. An aggregate database holds monthly totals reported by each facility (for example, how many patients are on antiretroviral treatment) and not the individual patients. It is organised as data elements, organisation units, periods, datasets and completed returns. For HIV viral load, the target is for 95% of those tested to be suppressed.

**In the simulation.** A PostgreSQL database on the partner's laptop (Machine B), reachable only through the gateway and not by direct SQL. 17 tables populated and 11 left empty on purpose. 29,596 data values, 18 monthly periods, 22 organisation units including 10 Gauteng facilities, and 120 completed monthly returns. Patients on ART rise from 2,845 in January 2025 to 2,882 in December 2025. Viral load suppression improves each quarter, from 85.5% to 94.0%, and stays under the 95% target. This card is written from the earlier Machine B record, which is not in the 11-document pack.$b$,
shortfalls = $b$- **Open:** queries fail because the schema search path is set wrong. The partner has to fix this before the gateway can read it.
- Aggregate totals hide duplicates and errors in the underlying patient data.
- Real returns arrive late and incomplete. The simulation's monthly returns are tidy.
- Direct SQL from Rajen's machine is impossible by design, so any test must go through the Machine B bridge, which is not built yet.$b$
where slug = 'dhis2_aggregate';

update public.databases set
background = $b$**In real life.** TIER.Net (Three Interlinked Electronic Registers) is the electronic register used to record each patient on antiretroviral therapy in the South African public sector. It replaced paper registers from December 2010 and has been rolled out to most public ART service points. A 2025 study found that viral load capture in TIER.Net has reached close to 100%, while CD4 capture is still sub-optimal. The research found no source saying it has been replaced.

**In the simulation.** A file-based SQLite database on the partner's laptop (Machine B), with no network port. 13 tables populated and 12 left empty on purpose. 38,521 rows, 3,515 patients (3,380 real and 135 planted duplicates), 18,799 visits, 3,069 viral load results and 1,269 CD4 results. Six counted defects are planted: duplicate registrations 135 (4.0%), missing baseline CD4 185 (5.5%), late data entry over 30 days 1,638 (8.7%), legacy regimens from before 2016 56 (2.0%), no outcome after six months 169 (5.0%), and viral load stored as text 100 (3.4%). This card is written from the earlier Machine B record.$b$,
shortfalls = $b$- **Open:** the partner needs to confirm the schema, because tables may be missing against the build spec.
- It covers one programme (ART).
- Real patients move between clinics and are registered again, which produces duplicates the simulation can only approximate.
- The gateway must convert text viral loads to numbers and flag the 56 pre-2016 regimens for review.
- It cannot be reached by direct SQL, so the bridge is needed.$b$
where slug = 'tiernet_clinic';
