-- Allow chart sections in db_content (bar, stacked and before-after charts written by content-write).
-- Run in the Supabase SQL Editor after 20261112000000_db_content.sql. Safe to re-run.
alter table public.db_content drop constraint if exists db_content_kind_check;
alter table public.db_content add constraint db_content_kind_check check (kind in ('text', 'table', 'queries', 'sources', 'chart'));
