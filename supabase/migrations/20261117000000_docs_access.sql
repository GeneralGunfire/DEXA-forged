-- Documents for Claude Code: a fourth token scope ("docs") and the details a document needs
-- (folder, tags, reason, who made it, version links). Safe to run more than once. Run it in the Supabase SQL Editor.
-- Run 20261116000000_document_folders.sql first if you have not already; this file repeats the folder column so it stands alone.

-- ---------- token scope ----------
alter table public.log_tokens drop constraint if exists log_tokens_scope_check;
alter table public.log_tokens add constraint log_tokens_scope_check check (scope in ('log', 'content', 'read', 'docs'));

-- ---------- general documents (the Documents tab) ----------
alter table public.documents add column if not exists folder text not null default '';
alter table public.documents drop constraint if exists documents_folder_len;
alter table public.documents add constraint documents_folder_len check (char_length(folder) <= 80);
alter table public.documents add column if not exists description text not null default '';
alter table public.documents add column if not exists reason text not null default '';
alter table public.documents add column if not exists tags text[] not null default '{}';
alter table public.documents add column if not exists made_by text not null default '';
alter table public.documents add column if not exists is_current boolean not null default true;
alter table public.documents add column if not exists replaces_id uuid references public.documents (id) on delete set null;
-- files added by Claude Code have no signed-in user
alter table public.documents alter column created_by drop not null;
create index if not exists documents_folder_idx on public.documents (folder) where database_id is null;

-- ---------- per-database documents ----------
alter table public.db_documents add column if not exists reason text not null default '';
alter table public.db_documents add column if not exists tags text[] not null default '{}';
alter table public.db_documents add column if not exists made_by text not null default '';
