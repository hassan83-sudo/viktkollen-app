create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.user_backup_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  secret_id uuid not null unique,
  created_at timestamptz not null default now()
);

alter table private.user_backup_keys enable row level security;
alter table private.user_backup_keys force row level security;
revoke all privileges on table private.user_backup_keys from public, anon, authenticated;

drop policy if exists "No direct client access" on private.user_backup_keys;
create policy "No direct client access"
on private.user_backup_keys as restrictive for all to public
using (false)
with check (false);

create or replace function private.delete_user_backup_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id = old.secret_id;
  return old;
end;
$$;

revoke all on function private.delete_user_backup_secret() from public, anon, authenticated;

drop trigger if exists delete_user_backup_secret on private.user_backup_keys;
create trigger delete_user_backup_secret
after delete on private.user_backup_keys
for each row execute function private.delete_user_backup_secret();

create or replace function public.viktkollen_get_or_create_backup_key()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  stored_secret_id uuid;
  backup_key text;
begin
  if requester_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requester_id::text, 0)
  );

  select secret_id
  into stored_secret_id
  from private.user_backup_keys
  where user_id = requester_id;

  if stored_secret_id is null then
    backup_key := pg_catalog.encode(extensions.gen_random_bytes(32), 'base64');

    select vault.create_secret(
      backup_key,
      null,
      'Viktkollen client-side backup encryption key',
      null
    )
    into stored_secret_id;

    insert into private.user_backup_keys (user_id, secret_id)
    values (requester_id, stored_secret_id);
  else
    select decrypted_secret
    into backup_key
    from vault.decrypted_secrets
    where id = stored_secret_id;
  end if;

  if backup_key is null then
    raise exception 'Backup key unavailable';
  end if;

  return backup_key;
end;
$$;

revoke all on function public.viktkollen_get_or_create_backup_key() from public, anon;
grant execute on function public.viktkollen_get_or_create_backup_key() to authenticated;

comment on function public.viktkollen_get_or_create_backup_key() is
'Returns only the signed-in user''s backup key. The encrypted key remains outside database dumps in Supabase Vault.';
