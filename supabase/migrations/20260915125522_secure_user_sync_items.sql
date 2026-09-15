-- Restrict direct access and encrypt every existing sync payload with the
-- signed-in user's Vault-backed client key. New clients use the same format.
revoke all privileges on table public.user_sync_items from anon, authenticated;
grant select, insert, update, delete on table public.user_sync_items to authenticated;
revoke execute on function public.viktkollen_set_sync_item_owner() from public, anon, authenticated;

drop policy if exists "Viktkollen users read own sync items" on public.user_sync_items;
drop policy if exists "Viktkollen users insert own sync items" on public.user_sync_items;
drop policy if exists "Viktkollen users update own sync items" on public.user_sync_items;
drop policy if exists "Viktkollen users delete own sync items" on public.user_sync_items;

create policy "Viktkollen users read own sync items"
on public.user_sync_items for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Viktkollen users insert own sync items"
on public.user_sync_items for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Viktkollen users update own sync items"
on public.user_sync_items for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Viktkollen users delete own sync items"
on public.user_sync_items for delete to authenticated
using ((select auth.uid()) = user_id);

do $$
declare
  owner record;
  new_secret_id uuid;
  new_key text;
begin
  for owner in
    select distinct sync_item.user_id
    from public.user_sync_items sync_item
    left join private.user_backup_keys key_map on key_map.user_id = sync_item.user_id
    where key_map.user_id is null
  loop
    new_key := pg_catalog.encode(extensions.gen_random_bytes(32), 'base64');
    select vault.create_secret(
      new_key,
      null,
      'Viktkollen client-side backup and sync encryption key',
      null
    ) into new_secret_id;

    insert into private.user_backup_keys (user_id, secret_id)
    values (owner.user_id, new_secret_id);
  end loop;
end;
$$;

alter table public.user_sync_items disable trigger viktkollen_user_sync_items_owner;

with source_rows as (
  select
    sync_item.id,
    sync_item.storage_key,
    sync_item.payload,
    pg_catalog.decode(secret.decrypted_secret, 'base64') as encryption_key,
    extensions.gen_random_bytes(16) as iv
  from public.user_sync_items sync_item
  join private.user_backup_keys key_map on key_map.user_id = sync_item.user_id
  join vault.decrypted_secrets secret on secret.id = key_map.secret_id
  where sync_item.payload is not null
    and (
      pg_catalog.jsonb_typeof(sync_item.payload) = 'object'
      and sync_item.payload ->> 'format' = 'viktkollen-sync-aes-cbc-hmac-v1'
    ) is not true
    )
), encrypted_rows as (
  select
    id,
    storage_key,
    iv,
    extensions.encrypt_iv(
      pg_catalog.convert_to(payload::text, 'UTF8'),
      encryption_key,
      iv,
      'aes-cbc/pad:pkcs'
    ) as ciphertext,
    encryption_key
  from source_rows
)
update public.user_sync_items sync_item
set payload = pg_catalog.jsonb_build_object(
  'ciphertext', pg_catalog.encode(encrypted.ciphertext, 'base64'),
  'format', 'viktkollen-sync-aes-cbc-hmac-v1',
  'iv', pg_catalog.encode(encrypted.iv, 'base64'),
  'mac', pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to(encrypted.storage_key, 'UTF8') || encrypted.iv || encrypted.ciphertext,
      encrypted.encryption_key,
      'sha256'
    ),
    'base64'
  )
)
from encrypted_rows encrypted
where sync_item.id = encrypted.id;

alter table public.user_sync_items enable trigger viktkollen_user_sync_items_owner;

alter table public.user_sync_items
drop constraint if exists user_sync_items_payload_encrypted;

alter table public.user_sync_items
add constraint user_sync_items_payload_encrypted check (
  payload is null
  or (
    pg_catalog.jsonb_typeof(payload) = 'object'
    and coalesce(payload ->> 'format' = 'viktkollen-sync-aes-cbc-hmac-v1', false)
    and pg_catalog.jsonb_typeof(payload -> 'ciphertext') = 'string'
    and pg_catalog.jsonb_typeof(payload -> 'iv') = 'string'
    and pg_catalog.jsonb_typeof(payload -> 'mac') = 'string'
  )
);

comment on table public.user_sync_items is
'Allowlisted sync metadata with authenticated client-side encrypted payloads. Automatic cloud sync remains disabled.';
