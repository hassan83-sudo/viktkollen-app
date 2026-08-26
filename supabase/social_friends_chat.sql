-- Viktkollen social friends + 1:1 chat V1 (security gate).
-- Run in Supabase SQL Editor as a project admin.
-- Never expose service-role credentials in the client app.
-- Do not apply blindly in production without a backup; this file is additive.
-- Feature flag social stays false until this migration is applied and verified.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.social_public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_public_profiles_username_format
    check (username ~ '^[a-z0-9_]{3,24}$'),
  constraint social_public_profiles_display_name_len
    check (char_length(display_name) between 1 and 48)
);

create unique index if not exists social_public_profiles_username_uidx
on public.social_public_profiles (username);

create table if not exists public.social_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint social_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists social_blocks_blocked_idx
on public.social_blocks (blocked_id);

create table if not exists public.social_friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint social_friend_requests_not_self check (from_user_id <> to_user_id),
  constraint social_friend_requests_status_check
    check (status in ('pending', 'accepted', 'declined', 'cancelled'))
);

-- One pending request per unordered pair (A→B and B→A race-safe).
create unique index if not exists social_friend_requests_pending_pair_idx
on public.social_friend_requests (
  least(from_user_id, to_user_id),
  greatest(from_user_id, to_user_id)
)
where status = 'pending';

create table if not exists public.social_friendships (
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  constraint social_friendships_ordered check (user_low < user_high)
);

create table if not exists public.social_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'dm',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_conversations_kind_check check (kind in ('dm'))
);

create table if not exists public.social_conversation_members (
  conversation_id uuid not null references public.social_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz,
  unread_count integer not null default 0,
  primary key (conversation_id, user_id),
  constraint social_conversation_members_unread_nonneg check (unread_count >= 0)
);

create index if not exists social_conversation_members_user_idx
on public.social_conversation_members (user_id);

-- Enforces at most one DM conversation per unordered user pair.
create table if not exists public.social_dm_pairs (
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null unique references public.social_conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  constraint social_dm_pairs_ordered check (user_low < user_high)
);

create table if not exists public.social_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.social_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'text',
  body text,
  created_at timestamptz not null default now(),
  constraint social_messages_type_check check (type in ('text', 'image', 'system')),
  constraint social_messages_v1_body_check check (
    type <> 'text' or (body is not null and char_length(body) between 1 and 4000)
  )
);

create index if not exists social_messages_conversation_created_idx
on public.social_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.social_public_profiles enable row level security;
alter table public.social_public_profiles force row level security;
alter table public.social_blocks enable row level security;
alter table public.social_blocks force row level security;
alter table public.social_friend_requests enable row level security;
alter table public.social_friend_requests force row level security;
alter table public.social_friendships enable row level security;
alter table public.social_friendships force row level security;
alter table public.social_conversations enable row level security;
alter table public.social_conversations force row level security;
alter table public.social_conversation_members enable row level security;
alter table public.social_conversation_members force row level security;
alter table public.social_dm_pairs enable row level security;
alter table public.social_dm_pairs force row level security;
alter table public.social_messages enable row level security;
alter table public.social_messages force row level security;

-- ---------------------------------------------------------------------------
-- Internal helpers (SECURITY DEFINER + fixed search_path)
-- ---------------------------------------------------------------------------

create or replace function public.social_is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Do not reveal block status between arbitrary third parties.
  select (
    auth.uid() is null
    or auth.uid() = a
    or auth.uid() = b
  ) and exists (
    select 1 from public.social_blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function public.social_are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    auth.uid() is null
    or auth.uid() = a
    or auth.uid() = b
  ) and exists (
    select 1 from public.social_friendships
    where user_low = least(a, b) and user_high = greatest(a, b)
  );
$$;

create or replace function public.social_is_member(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Probe only own membership (or service_role where auth.uid() is null).
  select (
    auth.uid() is null
    or p_user_id = auth.uid()
  ) and exists (
    select 1 from public.social_conversation_members
    where conversation_id = p_conversation_id and user_id = p_user_id
  );
$$;

create or replace function public.social_normalize_username(p_username text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  normalized text;
begin
  normalized := lower(trim(coalesce(p_username, '')));
  if normalized !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'invalid username';
  end if;
  return normalized;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers: force auth.uid() actors
-- ---------------------------------------------------------------------------

create or replace function public.social_set_profile_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  if new.user_id is null then
    raise exception 'unauthenticated';
  end if;
  new.username := public.social_normalize_username(new.username);
  new.display_name := left(trim(coalesce(new.display_name, '')), 48);
  if char_length(new.display_name) < 1 then
    raise exception 'invalid display_name';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists social_profiles_set_actor on public.social_public_profiles;
create trigger social_profiles_set_actor
before insert or update on public.social_public_profiles
for each row execute function public.social_set_profile_actor();

create or replace function public.social_set_request_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.from_user_id := auth.uid();
  if new.from_user_id is null or new.to_user_id is null or new.from_user_id = new.to_user_id then
    raise exception 'invalid friend request';
  end if;
  if public.social_is_blocked(new.from_user_id, new.to_user_id) then
    raise exception 'blocked';
  end if;
  if public.social_are_friends(new.from_user_id, new.to_user_id) then
    raise exception 'already friends';
  end if;
  new.status := 'pending';
  return new;
end;
$$;

drop trigger if exists social_friend_requests_set_actor on public.social_friend_requests;
create trigger social_friend_requests_set_actor
before insert on public.social_friend_requests
for each row execute function public.social_set_request_actor();

create or replace function public.social_set_block_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.blocker_id := auth.uid();
  if new.blocker_id is null or new.blocked_id is null or new.blocker_id = new.blocked_id then
    raise exception 'invalid block';
  end if;
  return new;
end;
$$;

drop trigger if exists social_blocks_set_actor on public.social_blocks;
create trigger social_blocks_set_actor
before insert on public.social_blocks
for each row execute function public.social_set_block_actor();

-- After block: cancel pending requests both ways and remove friendship.
create or replace function public.social_after_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.social_friend_requests
    set status = 'cancelled', responded_at = now()
    where status = 'pending'
      and least(from_user_id, to_user_id) = least(new.blocker_id, new.blocked_id)
      and greatest(from_user_id, to_user_id) = greatest(new.blocker_id, new.blocked_id);

  delete from public.social_friendships
  where user_low = least(new.blocker_id, new.blocked_id)
    and user_high = greatest(new.blocker_id, new.blocked_id);

  return new;
end;
$$;

drop trigger if exists social_blocks_after_insert on public.social_blocks;
create trigger social_blocks_after_insert
after insert on public.social_blocks
for each row execute function public.social_after_block();

create or replace function public.social_set_message_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other_id uuid;
begin
  -- Always overwrite client-supplied sender_id.
  new.sender_id := auth.uid();
  new.type := coalesce(new.type, 'text');
  if new.type <> 'text' then
    raise exception 'unsupported message type';
  end if;
  if new.sender_id is null then
    raise exception 'unauthenticated';
  end if;
  if not public.social_is_member(new.conversation_id, new.sender_id) then
    raise exception 'not a participant';
  end if;
  select user_id into other_id
  from public.social_conversation_members
  where conversation_id = new.conversation_id and user_id <> new.sender_id
  limit 1;
  if other_id is null
     or public.social_is_blocked(new.sender_id, other_id)
     or not public.social_are_friends(new.sender_id, other_id) then
    raise exception 'cannot send';
  end if;
  update public.social_conversations set updated_at = now() where id = new.conversation_id;
  update public.social_conversation_members
    set unread_count = unread_count + 1
    where conversation_id = new.conversation_id and user_id <> new.sender_id;
  return new;
end;
$$;

drop trigger if exists social_messages_set_actor on public.social_messages;
create trigger social_messages_set_actor
before insert on public.social_messages
for each row execute function public.social_set_message_actor();

-- Messages are immutable for clients (no spoofed sender updates).
create or replace function public.social_reject_message_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'messages are immutable';
end;
$$;

drop trigger if exists social_messages_no_update on public.social_messages;
create trigger social_messages_no_update
before update on public.social_messages
for each row execute function public.social_reject_message_mutation();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.social_upsert_public_profile(
  p_username text,
  p_display_name text,
  p_avatar_url text default null
)
returns public.social_public_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.social_public_profiles;
  uid uuid := auth.uid();
  normalized text;
  safe_name text;
begin
  if uid is null then
    raise exception 'unauthenticated';
  end if;
  normalized := public.social_normalize_username(p_username);
  safe_name := left(trim(coalesce(p_display_name, '')), 48);
  if char_length(safe_name) < 1 then
    raise exception 'invalid display_name';
  end if;
  -- Never copy email/phone into public profile.
  insert into public.social_public_profiles (user_id, username, display_name, avatar_url)
  values (uid, normalized, safe_name, nullif(trim(coalesce(p_avatar_url, '')), ''))
  on conflict (user_id) do update
    set username = excluded.username,
        display_name = excluded.display_name,
        avatar_url = excluded.avatar_url,
        updated_at = now()
  returning * into row;
  return row;
end;
$$;

create or replace function public.social_respond_friend_request(p_request_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request public.social_friend_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;
  if p_status not in ('accepted', 'declined') then
    raise exception 'invalid status';
  end if;
  select * into request from public.social_friend_requests where id = p_request_id for update;
  if request.id is null or request.to_user_id <> auth.uid() or request.status <> 'pending' then
    raise exception 'not allowed';
  end if;
  if public.social_is_blocked(request.from_user_id, request.to_user_id) then
    raise exception 'blocked';
  end if;
  update public.social_friend_requests
    set status = p_status, responded_at = now()
    where id = p_request_id;
  if p_status = 'accepted' then
    insert into public.social_friendships (user_low, user_high)
    values (
      least(request.from_user_id, request.to_user_id),
      greatest(request.from_user_id, request.to_user_id)
    )
    on conflict do nothing;
  end if;
end;
$$;

create or replace function public.social_remove_friend(p_other_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_other_user_id is null or auth.uid() = p_other_user_id then
    raise exception 'not allowed';
  end if;
  delete from public.social_friendships
  where user_low = least(auth.uid(), p_other_user_id)
    and user_high = greatest(auth.uid(), p_other_user_id);
end;
$$;

-- Race-safe DM open: advisory xact lock + unique social_dm_pairs row.
create or replace function public.social_open_dm(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  low uuid;
  high uuid;
  conversation uuid;
begin
  if me is null or p_other_user_id is null or me = p_other_user_id then
    raise exception 'invalid conversation';
  end if;
  if public.social_is_blocked(me, p_other_user_id) or not public.social_are_friends(me, p_other_user_id) then
    raise exception 'not allowed';
  end if;

  low := least(me, p_other_user_id);
  high := greatest(me, p_other_user_id);

  -- Serialize concurrent open_dm for the same unordered pair.
  perform pg_advisory_xact_lock(hashtext(low::text || ':' || high::text));

  select conversation_id into conversation
  from public.social_dm_pairs
  where user_low = low and user_high = high;

  if conversation is not null then
    return conversation;
  end if;

  insert into public.social_conversations (kind) values ('dm') returning id into conversation;
  insert into public.social_conversation_members (conversation_id, user_id) values (conversation, me);
  insert into public.social_conversation_members (conversation_id, user_id) values (conversation, p_other_user_id);
  insert into public.social_dm_pairs (user_low, user_high, conversation_id)
  values (low, high, conversation);

  return conversation;
exception
  when unique_violation then
    select conversation_id into conversation
    from public.social_dm_pairs
    where user_low = low and user_high = high;
    if conversation is null then
      raise;
    end if;
    return conversation;
end;
$$;

create or replace function public.social_mark_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.social_is_member(p_conversation_id, auth.uid()) then
    raise exception 'not a participant';
  end if;
  update public.social_conversation_members
    set unread_count = 0, last_read_at = now()
    where conversation_id = p_conversation_id and user_id = auth.uid();
end;
$$;

-- Privacy-first account purge (policy A: delete).
-- Deletes the deleted user's profile, requests, friendships, blocks,
-- and EVERY DM thread they participated in (messages + members + pair + conversation).
-- Surviving friend B therefore loses that shared thread; no PII of A remains in social tables.
-- Callable by: service_role only (account-deletion API).
create or replace function public.social_purge_user_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  conv_ids uuid[];
begin
  if p_user_id is null then
    raise exception 'invalid user';
  end if;
  if auth.role() is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;

  select coalesce(array_agg(conversation_id), '{}') into conv_ids
  from public.social_conversation_members
  where user_id = p_user_id;

  if array_length(conv_ids, 1) is not null then
    delete from public.social_messages where conversation_id = any (conv_ids);
    delete from public.social_conversation_members where conversation_id = any (conv_ids);
    delete from public.social_dm_pairs where conversation_id = any (conv_ids);
    delete from public.social_conversations where id = any (conv_ids);
  end if;

  delete from public.social_friend_requests
  where from_user_id = p_user_id or to_user_id = p_user_id;

  delete from public.social_friendships
  where user_low = p_user_id or user_high = p_user_id;

  delete from public.social_blocks
  where blocker_id = p_user_id or blocked_id = p_user_id;

  delete from public.social_public_profiles where user_id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

drop policy if exists "social profiles read" on public.social_public_profiles;
drop policy if exists "social profiles write own" on public.social_public_profiles;
drop policy if exists "social profiles update own" on public.social_public_profiles;
drop policy if exists "social blocks read own" on public.social_blocks;
drop policy if exists "social blocks insert own" on public.social_blocks;
drop policy if exists "social blocks delete own" on public.social_blocks;
drop policy if exists "social requests read involved" on public.social_friend_requests;
drop policy if exists "social requests insert self" on public.social_friend_requests;
drop policy if exists "social friendships read own" on public.social_friendships;
drop policy if exists "social conversations read members" on public.social_conversations;
drop policy if exists "social members read own conv" on public.social_conversation_members;
drop policy if exists "social members update own" on public.social_conversation_members;
drop policy if exists "social dm pairs read own" on public.social_dm_pairs;
drop policy if exists "social messages read members" on public.social_messages;
drop policy if exists "social messages insert members" on public.social_messages;

create policy "social profiles read"
on public.social_public_profiles for select to authenticated
using (true);

create policy "social profiles write own"
on public.social_public_profiles for insert to authenticated
with check (auth.uid() = user_id);

create policy "social profiles update own"
on public.social_public_profiles for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "social blocks read own"
on public.social_blocks for select to authenticated
using (auth.uid() = blocker_id);

create policy "social blocks insert own"
on public.social_blocks for insert to authenticated
with check (auth.uid() = blocker_id);

create policy "social blocks delete own"
on public.social_blocks for delete to authenticated
using (auth.uid() = blocker_id);

create policy "social requests read involved"
on public.social_friend_requests for select to authenticated
using (auth.uid() = from_user_id or auth.uid() = to_user_id);

create policy "social requests insert self"
on public.social_friend_requests for insert to authenticated
with check (auth.uid() = from_user_id);

create policy "social friendships read own"
on public.social_friendships for select to authenticated
using (auth.uid() = user_low or auth.uid() = user_high);

create policy "social conversations read members"
on public.social_conversations for select to authenticated
using (public.social_is_member(id, auth.uid()));

create policy "social members read own conv"
on public.social_conversation_members for select to authenticated
using (public.social_is_member(conversation_id, auth.uid()));

create policy "social members update own"
on public.social_conversation_members for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "social dm pairs read own"
on public.social_dm_pairs for select to authenticated
using (auth.uid() = user_low or auth.uid() = user_high);

create policy "social messages read members"
on public.social_messages for select to authenticated
using (public.social_is_member(conversation_id, auth.uid()));

create policy "social messages insert members"
on public.social_messages for insert to authenticated
with check (
  auth.uid() = sender_id
  and type = 'text'
  and public.social_is_member(conversation_id, auth.uid())
);

-- ---------------------------------------------------------------------------
-- Grants / revokes
-- ---------------------------------------------------------------------------

revoke all on table public.social_public_profiles from public, anon;
revoke all on table public.social_blocks from public, anon;
revoke all on table public.social_friend_requests from public, anon;
revoke all on table public.social_friendships from public, anon;
revoke all on table public.social_conversations from public, anon;
revoke all on table public.social_conversation_members from public, anon;
revoke all on table public.social_dm_pairs from public, anon;
revoke all on table public.social_messages from public, anon;

grant select, insert, update on public.social_public_profiles to authenticated;
grant select, insert, delete on public.social_blocks to authenticated;
grant select, insert on public.social_friend_requests to authenticated;
grant select on public.social_friendships to authenticated;
grant select on public.social_conversations to authenticated;
grant select, update on public.social_conversation_members to authenticated;
grant select on public.social_dm_pairs to authenticated;
grant select, insert on public.social_messages to authenticated;

revoke all on function public.social_is_blocked(uuid, uuid) from public, anon;
revoke all on function public.social_are_friends(uuid, uuid) from public, anon;
revoke all on function public.social_is_member(uuid, uuid) from public, anon;
revoke all on function public.social_normalize_username(text) from public, anon, authenticated;
revoke all on function public.social_set_profile_actor() from public, anon, authenticated;
revoke all on function public.social_set_request_actor() from public, anon, authenticated;
revoke all on function public.social_set_block_actor() from public, anon, authenticated;
revoke all on function public.social_after_block() from public, anon, authenticated;
revoke all on function public.social_set_message_actor() from public, anon, authenticated;
revoke all on function public.social_reject_message_mutation() from public, anon, authenticated;
revoke all on function public.social_upsert_public_profile(text, text, text) from public, anon;
revoke all on function public.social_respond_friend_request(uuid, text) from public, anon;
revoke all on function public.social_remove_friend(uuid) from public, anon;
revoke all on function public.social_open_dm(uuid) from public, anon;
revoke all on function public.social_mark_read(uuid) from public, anon;
revoke all on function public.social_purge_user_data(uuid) from public, anon;
revoke all on function public.social_purge_user_data(uuid) from authenticated;

-- Helpers are required by RLS policies; probing is limited inside the functions.
grant execute on function public.social_is_blocked(uuid, uuid) to authenticated;
grant execute on function public.social_are_friends(uuid, uuid) to authenticated;
grant execute on function public.social_is_member(uuid, uuid) to authenticated;

grant execute on function public.social_upsert_public_profile(text, text, text) to authenticated;
grant execute on function public.social_respond_friend_request(uuid, text) to authenticated;
grant execute on function public.social_remove_friend(uuid) to authenticated;
grant execute on function public.social_open_dm(uuid) to authenticated;
grant execute on function public.social_mark_read(uuid) to authenticated;
grant execute on function public.social_purge_user_data(uuid) to service_role;

alter table public.social_messages replica identity full;
alter table public.social_conversation_members replica identity full;

comment on table public.social_public_profiles is
  'Public social identity only: username, display_name, avatar_url. Never store email or phone.';
comment on table public.social_messages is
  'Private 1:1 chat. Participants only. Immutable. AI Coach must not read automatically.';
comment on table public.social_blocks is
  'Private block list. Only the blocker can read their own rows. Bidirectional contact ban.';
comment on table public.social_dm_pairs is
  'Unique unordered DM pair → conversation_id. Prevents duplicate 1:1 conversations.';
comment on function public.social_purge_user_data(uuid) is
  'Privacy-first V1 account purge (policy A delete): removes profile, relations, and entire DM threads the user belonged to.';
