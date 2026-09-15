-- Chat message defense in depth: database access remains participant-only and
-- bodies are encrypted before they reach public.social_messages.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.social_conversation_keys (
  conversation_id uuid primary key references public.social_conversations(id) on delete cascade,
  secret_id uuid not null unique,
  created_at timestamptz not null default now()
);
alter table private.social_conversation_keys enable row level security;
alter table private.social_conversation_keys force row level security;
revoke all privileges on table private.social_conversation_keys from public, anon, authenticated;
drop policy if exists "No direct chat key access" on private.social_conversation_keys;
create policy "No direct chat key access" on private.social_conversation_keys as restrictive for all to public using (false) with check (false);

create or replace function public.social_get_conversation_key(p_conversation_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  stored_secret_id uuid;
  conversation_key text;
begin
  if requester_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.social_conversation_members
    where conversation_id = p_conversation_id and user_id = requester_id
  ) then raise exception 'Not a conversation participant' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_conversation_id::text, 0));
  select secret_id into stored_secret_id from private.social_conversation_keys where conversation_id = p_conversation_id;
  if stored_secret_id is null then
    conversation_key := pg_catalog.encode(extensions.gen_random_bytes(32), 'base64');
    select vault.create_secret(conversation_key, null, 'Viktkollen private chat encryption key', null) into stored_secret_id;
    insert into private.social_conversation_keys (conversation_id, secret_id) values (p_conversation_id, stored_secret_id);
  else
    select decrypted_secret into conversation_key from vault.decrypted_secrets where id = stored_secret_id;
  end if;
  if conversation_key is null then raise exception 'Conversation key unavailable'; end if;
  return conversation_key;
end;
$$;
revoke all on function public.social_get_conversation_key(uuid) from public, anon;
grant execute on function public.social_get_conversation_key(uuid) to authenticated;

do $$
declare
  item record;
  new_secret_id uuid;
  new_key text;
begin
  for item in
    select c.id as conversation_id
    from public.social_conversations c
    left join private.social_conversation_keys k on k.conversation_id = c.id
    where k.conversation_id is null
  loop
    new_key := pg_catalog.encode(extensions.gen_random_bytes(32), 'base64');
    select vault.create_secret(new_key, null, 'Viktkollen private chat encryption key', null) into new_secret_id;
    insert into private.social_conversation_keys (conversation_id, secret_id) values (item.conversation_id, new_secret_id);
  end loop;
end;
$$;

alter table public.social_messages disable trigger social_messages_no_update;
with source_rows as (
  select m.id, m.conversation_id, m.body,
    pg_catalog.decode(s.decrypted_secret, 'base64') as encryption_key,
    extensions.gen_random_bytes(16) as iv
  from public.social_messages m
  join private.social_conversation_keys k on k.conversation_id = m.conversation_id
  join vault.decrypted_secrets s on s.id = k.secret_id
  where m.type = 'text'
    and (case when m.body ~ '^\\s*\\{' then m.body::jsonb ->> 'format' end = 'viktkollen-social-message-aes-cbc-hmac-v1') is not true
), encrypted_rows as (
  select id, conversation_id, iv,
    extensions.encrypt_iv(pg_catalog.convert_to(body, 'UTF8'), encryption_key, iv, 'aes-cbc/pad:pkcs') as ciphertext,
    encryption_key
  from source_rows
)
update public.social_messages m
set body = pg_catalog.jsonb_build_object(
  'ciphertext', pg_catalog.encode(e.ciphertext, 'base64'),
  'format', 'viktkollen-social-message-aes-cbc-hmac-v1',
  'iv', pg_catalog.encode(e.iv, 'base64'),
  'mac', pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to(e.conversation_id::text || ':' || e.id::text, 'UTF8') || e.iv || e.ciphertext,
      e.encryption_key,
      'sha256'
    ),
    'base64'
  )
)
from encrypted_rows e
where m.id = e.id;
alter table public.social_messages enable trigger social_messages_no_update;

alter table public.social_messages drop constraint if exists social_messages_v1_body_check;
alter table public.social_messages add constraint social_messages_encrypted_body_check check (
  type <> 'text' or (
    body is not null and char_length(body) between 1 and 12000
    and coalesce(body::jsonb ->> 'format' = 'viktkollen-social-message-aes-cbc-hmac-v1', false)
    and jsonb_typeof(body::jsonb -> 'ciphertext') = 'string'
    and jsonb_typeof(body::jsonb -> 'iv') = 'string'
    and jsonb_typeof(body::jsonb -> 'mac') = 'string'
  )
);

revoke all on table public.social_messages from anon, authenticated;
grant select, insert on table public.social_messages to authenticated;
drop policy if exists "social messages read members" on public.social_messages;
drop policy if exists "social messages insert members" on public.social_messages;
create policy "social messages read members"
on public.social_messages for select to authenticated
using (public.social_is_member(conversation_id, (select auth.uid())));
create policy "social messages insert members"
on public.social_messages for insert to authenticated
with check (
  (select auth.uid()) = sender_id
  and type = 'text'
  and public.social_is_member(conversation_id, (select auth.uid()))
);

comment on table public.social_messages is
  'Private 1:1 chat. Participants only. Text bodies are client-encrypted and immutable. AI Coach must not read automatically.';
