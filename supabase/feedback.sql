-- =====================================================================
-- DEXA Forged: user feedback
-- Run ONCE in Supabase -> SQL Editor, after setup.sql. Safe to re-run.
--
-- Who can do what:
--   * ANYONE (the public explorer, signed out) can SEND feedback (insert only).
--   * Only the two team accounts can READ, triage, tag or delete it.
--   * Senders can never read anything back, including their own entry.
-- =====================================================================

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'explorer' check (source in ('explorer', 'forged', 'other')),
  page text not null default '' check (char_length(page) <= 200),
  rating smallint check (rating between 1 and 5),
  message text not null default '' check (char_length(message) <= 2000),
  contact text not null default '' check (char_length(contact) <= 200),
  tags text[] not null default '{}',
  status text not null default 'new' check (status in ('new', 'reviewing', 'done')),
  note text not null default '' check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  -- an entry must carry a rating, a message, or both
  constraint feedback_not_empty check (rating is not null or char_length(trim(message)) > 0)
);

create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_status_idx on public.feedback (status);

alter table public.feedback enable row level security;

-- the public can only insert a fresh, untouched entry (no pre-set status, tags or notes)
drop policy if exists "anyone can send feedback" on public.feedback;
create policy "anyone can send feedback" on public.feedback
  for insert to anon, authenticated
  with check (status = 'new' and note = '' and tags = '{}');

drop policy if exists "team reads feedback" on public.feedback;
create policy "team reads feedback" on public.feedback
  for select to authenticated using (public.is_team());

drop policy if exists "team updates feedback" on public.feedback;
create policy "team updates feedback" on public.feedback
  for update to authenticated using (public.is_team()) with check (public.is_team());

drop policy if exists "team deletes feedback" on public.feedback;
create policy "team deletes feedback" on public.feedback
  for delete to authenticated using (public.is_team());

grant insert on public.feedback to anon;
