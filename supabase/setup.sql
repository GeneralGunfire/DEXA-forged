-- =====================================================================
-- DEXA Forged: database setup
-- Run ONCE in Supabase -> SQL Editor (project jtvrvgqlgburffagfxru).
-- Safe to re-run.
--
-- Access rules:
--   * Only the two accounts in public.team can read or write the workspace.
--   * Message-board posts marked "public" (the default) are also readable by
--     anyone, so the latest ones can appear on the public landing page.
--   * Everything else is invisible to everyone outside the team.
-- =====================================================================

-- ---------- who is on the team ----------
create table if not exists public.team (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
);

insert into public.team (user_id, display_name) values
  ('af1d6d0b-1068-4c5d-ac9c-f69870739367', 'Rajen'),
  ('37aed8e3-1ecf-4785-82fa-da4f5a63c805', 'Huzayfa')
on conflict (user_id) do nothing;

create or replace function public.is_team()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team where user_id = (select auth.uid()));
$$;

revoke all on function public.is_team() from public, anon;
grant execute on function public.is_team() to authenticated;

-- ---------- message board ----------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 20000),
  image_paths text[] not null default '{}',               -- files in the public-posts bucket
  is_public boolean not null default true,                -- show on the public landing page
  posted_at timestamptz not null default now(),           -- editable, so posts can be backdated
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

-- ---------- database board ----------
create table if not exists public.databases (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  machine text not null default '',        -- which machine it lives on
  db_type text not null default '',        -- e.g. PostgreSQL, SQL Server, SQLite
  port text not null default '',           -- build record: port
  instance_name text not null default '',  -- build record: instance name
  background text not null default '' check (char_length(background) <= 20000),     -- real-world context
  shortfalls text not null default '' check (char_length(shortfalls) <= 20000),     -- real-world shortfalls
  build_record text not null default '' check (char_length(build_record) <= 40000),  -- tables, ports, population
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

-- development log entries
create table if not exists public.db_entries (
  id uuid primary key default gen_random_uuid(),
  database_id uuid not null references public.databases (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 20000),
  entry_date date not null default current_date,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

-- ---------- documents (database_id is null for the global Documents page) ----------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  path text not null,
  mime text,
  size bigint,
  database_id uuid references public.databases (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

-- ---------- branding ----------
create table if not exists public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  label text not null default '' check (char_length(label) <= 60),   -- e.g. Logo, Photo, Video
  path text not null,
  mime text,
  size bigint,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

-- ---------- schedule ----------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  notes text not null default '' check (char_length(notes) <= 5000),
  kind text not null default 'task' check (kind in ('task', 'event')),
  assignee uuid references auth.users (id),
  due_date date,
  done boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists posts_posted_at_idx on public.posts (posted_at desc);
create index if not exists db_entries_database_idx on public.db_entries (database_id);
create index if not exists documents_database_idx on public.documents (database_id);
create index if not exists tasks_due_idx on public.tasks (due_date);

-- ---------- row level security ----------
alter table public.team enable row level security;
drop policy if exists "team read" on public.team;
create policy "team read" on public.team for select to authenticated using (public.is_team());

do $$
declare t text;
begin
  foreach t in array array['posts', 'databases', 'db_entries', 'documents', 'brand_assets', 'tasks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "team access" on public.%I', t);
    execute format(
      'create policy "team access" on public.%I for all to authenticated using (public.is_team()) with check (public.is_team())',
      t
    );
  end loop;
end $$;

-- public posts are readable by anyone (for the landing page)
drop policy if exists "public posts" on public.posts;
create policy "public posts" on public.posts for select to anon, authenticated using (is_public);

-- ---------- file storage ----------
-- 1) private bucket: documents, branding, database files (team only, opened with signed links)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'forged-files', 'forged-files', false, 52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'video/mp4',
    'image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "forged files team" on storage.objects;
create policy "forged files team" on storage.objects
  for all to authenticated
  using (bucket_id = 'forged-files' and public.is_team())
  with check (bucket_id = 'forged-files' and public.is_team());

-- 2) public bucket: images attached to message-board posts (so the landing page can show them)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('public-posts', 'public-posts', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public posts team write" on storage.objects;
create policy "public posts team write" on storage.objects
  for all to authenticated
  using (bucket_id = 'public-posts' and public.is_team())
  with check (bucket_id = 'public-posts' and public.is_team());
