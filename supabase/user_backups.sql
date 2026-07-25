create table if not exists public.user_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_backups enable row level security;

drop policy if exists "Users can insert their own backup" on public.user_backups;
drop policy if exists "Users can update their own backup" on public.user_backups;

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
