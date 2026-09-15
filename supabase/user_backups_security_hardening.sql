-- Narrow public.user_backups to the minimum client privileges and owner-only RLS.
-- Safe to apply repeatedly.

alter table public.user_backups enable row level security;
alter table public.user_backups force row level security;

drop policy if exists "Users can read their own backup" on public.user_backups;
drop policy if exists "Users can insert their own backup" on public.user_backups;
drop policy if exists "Users can update their own backup" on public.user_backups;
drop policy if exists "Users can delete their own backup" on public.user_backups;
drop policy if exists "Viktkollen users read own backups" on public.user_backups;
drop policy if exists "Viktkollen users insert own backups" on public.user_backups;
drop policy if exists "Viktkollen users update own backups" on public.user_backups;
drop policy if exists "Viktkollen users delete own backups" on public.user_backups;

create policy "Viktkollen users read own backups"
on public.user_backups for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Viktkollen users insert own backups"
on public.user_backups for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Viktkollen users update own backups"
on public.user_backups for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Viktkollen users delete own backups"
on public.user_backups for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all privileges on table public.user_backups from anon;
revoke all privileges on table public.user_backups from authenticated;
grant select, insert, update, delete on table public.user_backups to authenticated;

-- This function is trigger-only; it must not be exposed through PostgREST RPC.
revoke execute on function public.viktkollen_set_user_id() from public, anon, authenticated;
