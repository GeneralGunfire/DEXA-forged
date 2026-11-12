-- Folders for the general Documents tab. A folder is just a name on each file; empty means "not in a folder".
-- Safe to run more than once. Run it in the Supabase SQL Editor.
alter table public.documents add column if not exists folder text not null default '';
alter table public.documents drop constraint if exists documents_folder_len;
alter table public.documents add constraint documents_folder_len check (char_length(folder) <= 80);
create index if not exists documents_folder_idx on public.documents (folder) where database_id is null;
