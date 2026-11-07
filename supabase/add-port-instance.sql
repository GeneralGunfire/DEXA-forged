-- Adds the Build record "Connection" fields to databases that were created
-- from an earlier version of setup.sql. Run once in Supabase -> SQL Editor.
-- Safe to re-run.

alter table public.databases add column if not exists port text not null default '';
alter table public.databases add column if not exists instance_name text not null default '';
