-- Viktkollen Cloud Sync V2
-- Kör manuellt i Supabase SQL Editor. Ändrar inte Supabase Auth-tabeller.

create extension if not exists pgcrypto;

create or replace function public.viktkollen_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.user_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text,
  payload jsonb not null default '{}'::jsonb,
  data jsonb,
  schema_version integer not null default 2,
  client_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_favorite boolean not null default false,
  size_bytes bigint not null default 0,
  checksum text
);

alter table public.user_backups add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table public.user_backups add column if not exists name text;
alter table public.user_backups add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.user_backups add column if not exists data jsonb;
alter table public.user_backups add column if not exists schema_version integer not null default 2;
alter table public.user_backups add column if not exists client_updated_at timestamptz;
alter table public.user_backups add column if not exists created_at timestamptz not null default now();
alter table public.user_backups add column if not exists updated_at timestamptz not null default now();
alter table public.user_backups add column if not exists is_favorite boolean not null default false;
alter table public.user_backups add column if not exists size_bytes bigint not null default 0;
alter table public.user_backups add column if not exists checksum text;
alter table public.user_backups alter column user_id set default auth.uid();
alter table public.user_backups alter column id set default gen_random_uuid();
alter table public.user_backups alter column schema_version set default 2;
alter table public.user_backups alter column is_favorite set default false;

update public.user_backups
set payload = data
where payload = '{}'::jsonb
  and data is not null;

create table if not exists public.user_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  latest_backup_id uuid references public.user_backups(id) on delete set null,
  client_updated_at timestamptz,
  cloud_updated_at timestamptz,
  last_sync_direction text,
  last_sync_status text,
  schema_version integer not null default 2,
  updated_at timestamptz not null default now()
);

alter table public.user_sync_state add column if not exists latest_backup_id uuid references public.user_backups(id) on delete set null;
alter table public.user_sync_state add column if not exists client_updated_at timestamptz;
alter table public.user_sync_state add column if not exists cloud_updated_at timestamptz;
alter table public.user_sync_state add column if not exists last_sync_direction text;
alter table public.user_sync_state add column if not exists last_sync_status text;
alter table public.user_sync_state add column if not exists schema_version integer not null default 2;
alter table public.user_sync_state add column if not exists updated_at timestamptz not null default now();
alter table public.user_sync_state alter column user_id set default auth.uid();

create table if not exists public.user_sync_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  event_type text not null,
  status text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.user_sync_events add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table public.user_sync_events add column if not exists event_type text not null default 'unknown';
alter table public.user_sync_events add column if not exists status text not null default 'unknown';
alter table public.user_sync_events add column if not exists message text;
alter table public.user_sync_events add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.user_sync_events add column if not exists created_at timestamptz not null default now();
alter table public.user_sync_events alter column user_id set default auth.uid();

create index if not exists user_backups_user_created_idx on public.user_backups (user_id, created_at desc);
create index if not exists user_backups_user_favorite_idx on public.user_backups (user_id, is_favorite desc, created_at desc);
create index if not exists user_backups_checksum_idx on public.user_backups (user_id, checksum);
create index if not exists user_sync_events_user_created_idx on public.user_sync_events (user_id, created_at desc);

create or replace function public.viktkollen_set_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id = auth.uid();

  if tg_table_name = 'user_backups' then
    new.updated_at = now();
    new.created_at = coalesce(new.created_at, now());
  end if;

  if tg_table_name = 'user_sync_state' then
    new.updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists viktkollen_user_backups_owner on public.user_backups;
create trigger viktkollen_user_backups_owner
before insert or update on public.user_backups
for each row execute function public.viktkollen_set_user_id();

drop trigger if exists viktkollen_user_sync_state_owner on public.user_sync_state;
create trigger viktkollen_user_sync_state_owner
before insert or update on public.user_sync_state
for each row execute function public.viktkollen_set_user_id();

drop trigger if exists viktkollen_user_sync_events_owner on public.user_sync_events;
create trigger viktkollen_user_sync_events_owner
before insert on public.user_sync_events
for each row execute function public.viktkollen_set_user_id();

alter table public.user_backups enable row level security;
alter table public.user_sync_state enable row level security;
alter table public.user_sync_events enable row level security;
alter table public.user_backups force row level security;
alter table public.user_sync_state force row level security;
alter table public.user_sync_events force row level security;

drop policy if exists "Viktkollen users read own backups" on public.user_backups;
drop policy if exists "Viktkollen users insert own backups" on public.user_backups;
drop policy if exists "Viktkollen users update own backups" on public.user_backups;
drop policy if exists "Viktkollen users delete own backups" on public.user_backups;

create policy "Viktkollen users read own backups"
on public.user_backups for select to authenticated
using (auth.uid() = user_id);

create policy "Viktkollen users insert own backups"
on public.user_backups for insert to authenticated
with check (auth.uid() = user_id);

create policy "Viktkollen users update own backups"
on public.user_backups for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Viktkollen users delete own backups"
on public.user_backups for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists "Viktkollen users read own sync state" on public.user_sync_state;
drop policy if exists "Viktkollen users insert own sync state" on public.user_sync_state;
drop policy if exists "Viktkollen users update own sync state" on public.user_sync_state;

create policy "Viktkollen users read own sync state"
on public.user_sync_state for select to authenticated
using (auth.uid() = user_id);

create policy "Viktkollen users insert own sync state"
on public.user_sync_state for insert to authenticated
with check (auth.uid() = user_id);

create policy "Viktkollen users update own sync state"
on public.user_sync_state for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Viktkollen users read own sync events" on public.user_sync_events;
drop policy if exists "Viktkollen users insert own sync events" on public.user_sync_events;

create policy "Viktkollen users read own sync events"
on public.user_sync_events for select to authenticated
using (auth.uid() = user_id);

create policy "Viktkollen users insert own sync events"
on public.user_sync_events for insert to authenticated
with check (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.user_backups to authenticated;
grant select, insert, update on public.user_sync_state to authenticated;
grant select, insert on public.user_sync_events to authenticated;

comment on table public.user_backups is 'Viktkollen manuella backupversioner. RLS begränsar rader till auth.uid().';
comment on table public.user_sync_state is 'Senaste manuella molnstatus per användare.';
comment on table public.user_sync_events is 'Kort historik över manuella molnåtgärder utan känsliga tokens.';
-- Automatic Cloud Sync V2 stores one allowlisted localStorage key per row.
-- It is intentionally separate from user_backups so manual backup/restore remains unchanged.
create table if not exists public.user_sync_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  storage_key text not null,
  payload jsonb,
  data_version integer not null default 1,
  client_updated_at timestamptz,
  server_updated_at timestamptz not null default now(),
  device_id text,
  checksum text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, storage_key)
);

alter table public.user_sync_items add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table public.user_sync_items add column if not exists storage_key text;
alter table public.user_sync_items add column if not exists payload jsonb;
alter table public.user_sync_items add column if not exists data_version integer not null default 1;
alter table public.user_sync_items add column if not exists client_updated_at timestamptz;
alter table public.user_sync_items add column if not exists server_updated_at timestamptz not null default now();
alter table public.user_sync_items add column if not exists device_id text;
alter table public.user_sync_items add column if not exists checksum text;
alter table public.user_sync_items add column if not exists deleted_at timestamptz;
alter table public.user_sync_items add column if not exists created_at timestamptz not null default now();
alter table public.user_sync_items alter column user_id set default auth.uid();
alter table public.user_sync_items alter column id set default gen_random_uuid();
alter table public.user_sync_items alter column data_version set default 1;

create unique index if not exists user_sync_items_user_storage_key_idx on public.user_sync_items (user_id, storage_key);
create index if not exists user_sync_items_user_server_idx on public.user_sync_items (user_id, server_updated_at desc);
create index if not exists user_sync_items_user_deleted_idx on public.user_sync_items (user_id, deleted_at);

create or replace function public.viktkollen_set_sync_item_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id = auth.uid();
  new.server_updated_at = now();
  new.created_at = coalesce(new.created_at, now());
  return new;
end;
$$;

drop trigger if exists viktkollen_user_sync_items_owner on public.user_sync_items;
create trigger viktkollen_user_sync_items_owner
before insert or update on public.user_sync_items
for each row execute function public.viktkollen_set_sync_item_owner();

alter table public.user_sync_items enable row level security;
alter table public.user_sync_items force row level security;

drop policy if exists "Viktkollen users read own sync items" on public.user_sync_items;
drop policy if exists "Viktkollen users insert own sync items" on public.user_sync_items;
drop policy if exists "Viktkollen users update own sync items" on public.user_sync_items;
drop policy if exists "Viktkollen users delete own sync items" on public.user_sync_items;

create policy "Viktkollen users read own sync items"
on public.user_sync_items for select to authenticated
using (auth.uid() = user_id);

create policy "Viktkollen users insert own sync items"
on public.user_sync_items for insert to authenticated
with check (auth.uid() = user_id);

create policy "Viktkollen users update own sync items"
on public.user_sync_items for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Viktkollen users delete own sync items"
on public.user_sync_items for delete to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_sync_items to authenticated;

comment on table public.user_sync_items is 'Automatisk Cloud Sync V2 per allowlistad localStorage-nyckel. Innehåller inga auth-sessioner, tokens eller hemligheter.';
