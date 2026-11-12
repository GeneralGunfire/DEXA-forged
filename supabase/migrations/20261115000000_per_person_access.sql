-- Per-person visibility.
--   * team gets a role: 'admin' sees everything, 'member' sees only what is theirs.
--   * tasks: a member sees tasks assigned to them, created by them, or not assigned to anyone.
--   * access tokens: a member sees and revokes only the tokens they created.
-- Timeline, records, documents, messages and feedback stay shared by the whole team.
-- The log-ingest, content-write and forge-read functions use the service role and are not affected.
-- Safe to run more than once. Run it in the Supabase SQL Editor.

-- ---------- roles ----------
alter table public.team add column if not exists role text not null default 'member';
alter table public.team drop constraint if exists team_role_check;
alter table public.team add constraint team_role_check check (role in ('admin', 'member'));
update public.team set role = 'admin' where display_name = 'Rajen';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team where user_id = (select auth.uid()) and role = 'admin');
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------- tasks ----------
drop policy if exists "team access" on public.tasks;
drop policy if exists "tasks read" on public.tasks;
drop policy if exists "tasks add" on public.tasks;
drop policy if exists "tasks change" on public.tasks;
drop policy if exists "tasks remove" on public.tasks;

create policy "tasks read" on public.tasks for select to authenticated
  using (public.is_team() and (public.is_admin() or assignee is null or assignee = (select auth.uid()) or created_by = (select auth.uid())));
create policy "tasks add" on public.tasks for insert to authenticated
  with check (public.is_team() and created_by = (select auth.uid()));
create policy "tasks change" on public.tasks for update to authenticated
  using (public.is_team() and (public.is_admin() or assignee is null or assignee = (select auth.uid()) or created_by = (select auth.uid())))
  with check (public.is_team());
create policy "tasks remove" on public.tasks for delete to authenticated
  using (public.is_team() and (public.is_admin() or created_by = (select auth.uid())));

-- ---------- access tokens ----------
drop policy if exists "team access" on public.log_tokens;
drop policy if exists "tokens read" on public.log_tokens;
drop policy if exists "tokens add" on public.log_tokens;
drop policy if exists "tokens revoke" on public.log_tokens;

create policy "tokens read" on public.log_tokens for select to authenticated
  using (public.is_team() and (public.is_admin() or created_by = (select auth.uid())));
create policy "tokens add" on public.log_tokens for insert to authenticated
  with check (public.is_team() and created_by = (select auth.uid()));
create policy "tokens revoke" on public.log_tokens for update to authenticated
  using (public.is_team() and (public.is_admin() or created_by = (select auth.uid())))
  with check (public.is_team());
-- no delete policy: tokens are revoked, never deleted from the site.
