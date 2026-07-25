create table if not exists public.user_backups (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_backups enable row level security;
alter table public.user_backups force row level security;
alter table public.user_backups alter column user_id set default auth.uid();

create or replace function public.set_user_backup_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.user_id = auth.uid();
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_backup_owner on public.user_backups;

create trigger set_user_backup_owner
before insert or update on public.user_backups
for each row
execute function public.set_user_backup_owner();

drop policy if exists "Users can read their own backup" on public.user_backups;
drop policy if exists "Users can insert their own backup" on public.user_backups;
drop policy if exists "Users can update their own backup" on public.user_backups;

create policy "Users can read their own backup"
on public.user_backups
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own backup"
on public.user_backups
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own backup"
on public.user_backups
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
