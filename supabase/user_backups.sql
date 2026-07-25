create extension if not exists pgcrypto;

create table if not exists public.user_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text,
  is_favorite boolean not null default false,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_backups add column if not exists id uuid default gen_random_uuid();
alter table public.user_backups add column if not exists name text;
alter table public.user_backups add column if not exists is_favorite boolean not null default false;
alter table public.user_backups add column if not exists created_at timestamptz not null default now();
alter table public.user_backups add column if not exists updated_at timestamptz not null default now();
alter table public.user_backups alter column user_id set default auth.uid();
alter table public.user_backups alter column id set default gen_random_uuid();
alter table public.user_backups alter column is_favorite set default false;
alter table public.user_backups alter column created_at set default now();
alter table public.user_backups alter column updated_at set default now();

update public.user_backups
set id = gen_random_uuid()
where id is null;

do $$
declare
  primary_key_name text;
  primary_key_columns text;
begin
  select
    con.conname,
    string_agg(att.attname, ',' order by att.attnum)
  into primary_key_name, primary_key_columns
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  join unnest(con.conkey) with ordinality cols(attnum, ord) on true
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = cols.attnum
  where nsp.nspname = 'public'
    and rel.relname = 'user_backups'
    and con.contype = 'p'
  group by con.conname;

  if primary_key_name is not null and primary_key_columns <> 'id' then
    execute format('alter table public.user_backups drop constraint %I', primary_key_name);
  end if;

  if primary_key_columns is distinct from 'id' then
    alter table public.user_backups alter column id set not null;
    alter table public.user_backups add constraint user_backups_pkey primary key (id);
  end if;
end $$;

alter table public.user_backups enable row level security;
alter table public.user_backups force row level security;

create or replace function public.set_user_backup_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.user_id = auth.uid();
  new.updated_at = now();

  if tg_op = 'INSERT' then
    new.created_at = coalesce(new.created_at, now());
  end if;

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
drop policy if exists "Users can delete their own backup" on public.user_backups;

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

create policy "Users can delete their own backup"
on public.user_backups
for delete
to authenticated
using (auth.uid() = user_id);
