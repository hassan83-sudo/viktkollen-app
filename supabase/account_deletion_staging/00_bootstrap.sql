-- INSTALL ORDER: 00, then 01, then 04. Use 02 only for a separate service-role RPC scenario.
-- Function bodies below are exact copies of the account-deletion migrations.
-- The session must already have viktkollen.account_deletion_harness=isolated-app-staging.
-- This file does not set that marker.

do $account_deletion_harness_guard$
begin
  if current_setting('viktkollen.account_deletion_harness', true) is distinct from 'isolated-app-staging' then
    raise exception 'refusing to run without viktkollen.account_deletion_harness=isolated-app-staging';
  end if;
end
$account_deletion_harness_guard$;

-- TEST/STAGING ONLY. NEVER RUN AGAINST PRODUCTION OR BILLING-STAGING.
-- Minimal account-deletion harness. Not a full Production RLS copy.
-- Requires a dedicated isolated app-staging project with auth.users.

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Sync and backups (cloud_sync_v2.sql table shape).
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
create index if not exists user_backups_user_created_idx on public.user_backups (user_id, created_at desc);
create index if not exists user_backups_user_favorite_idx on public.user_backups (user_id, is_favorite desc, created_at desc);
create index if not exists user_backups_checksum_idx on public.user_backups (user_id, checksum);

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

create table if not exists public.user_sync_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  event_type text not null,
  status text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists user_sync_events_user_created_idx on public.user_sync_events (user_id, created_at desc);

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
create unique index if not exists user_sync_items_user_storage_key_idx on public.user_sync_items (user_id, storage_key);
create index if not exists user_sync_items_user_server_idx on public.user_sync_items (user_id, server_updated_at desc);
create index if not exists user_sync_items_user_deleted_idx on public.user_sync_items (user_id, deleted_at);

create or replace function public.viktkollen_set_user_id()
returns trigger language plpgsql security definer set search_path = public as $$
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

create or replace function public.viktkollen_set_sync_item_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id = auth.uid();
  new.server_updated_at = now();
  new.created_at = coalesce(new.created_at, now());
  return new;
end;
$$;

drop trigger if exists viktkollen_user_backups_owner on public.user_backups;
create trigger viktkollen_user_backups_owner before insert or update on public.user_backups
for each row execute function public.viktkollen_set_user_id();
drop trigger if exists viktkollen_user_sync_state_owner on public.user_sync_state;
create trigger viktkollen_user_sync_state_owner before insert or update on public.user_sync_state
for each row execute function public.viktkollen_set_user_id();
drop trigger if exists viktkollen_user_sync_events_owner on public.user_sync_events;
create trigger viktkollen_user_sync_events_owner before insert or update on public.user_sync_events
for each row execute function public.viktkollen_set_user_id();
drop trigger if exists viktkollen_user_sync_items_owner on public.user_sync_items;
create trigger viktkollen_user_sync_items_owner before insert or update on public.user_sync_items
for each row execute function public.viktkollen_set_sync_item_owner();

-- Backup keys. Vault trigger matches the repo function. Fixtures use a
-- secret_id that is not a real Vault secret, so the delete matches zero rows.
create table if not exists private.user_backup_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  secret_id uuid not null unique,
  created_at timestamptz not null default now()
);
alter table private.user_backup_keys enable row level security;
alter table private.user_backup_keys force row level security;
revoke all privileges on table private.user_backup_keys from public, anon, authenticated;

create or replace function private.delete_user_backup_secret()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where id = old.secret_id;
  return old;
end;
$$;
revoke all on function private.delete_user_backup_secret() from public, anon, authenticated;
drop trigger if exists delete_user_backup_secret on private.user_backup_keys;
create trigger delete_user_backup_secret after delete on private.user_backup_keys
for each row execute function private.delete_user_backup_secret();

-- Social tables required by Policy C, from repo DDL.
create table if not exists public.social_public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_public_profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  constraint social_public_profiles_display_name_len check (char_length(display_name) between 1 and 48)
);
create unique index if not exists social_public_profiles_username_uidx on public.social_public_profiles (username);

create table if not exists public.social_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint social_blocks_not_self check (blocker_id <> blocked_id)
);

create table if not exists public.social_friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint social_friend_requests_not_self check (from_user_id <> to_user_id),
  constraint social_friend_requests_status_check check (status in ('pending', 'accepted', 'declined', 'cancelled'))
);

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

create table if not exists public.social_location_envelopes (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_device_id text not null,
  sender_device_id text not null,
  encrypted_payload text not null,
  encrypted_iv text not null,
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, recipient_user_id, recipient_device_id),
  constraint social_location_envelopes_not_self check (owner_user_id <> recipient_user_id)
);

-- social_locations from F22 catalog metadata. No CREATE exists in the repo.
create table if not exists public.social_locations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  updated_at timestamptz not null default now(),
  constraint social_locations_latitude_check check (latitude is null or (latitude >= -90 and latitude <= 90)),
  constraint social_locations_longitude_check check (longitude is null or (longitude >= -180 and longitude <= 180))
);

-- F15 tables from F22 metadata.
create table if not exists public.place_families (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.place_family_members (
  family_id uuid not null references public.place_families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  display_name text,
  primary key (family_id, user_id),
  constraint place_family_members_role_check check (role = any (array['guardian'::text, 'member'::text])),
  constraint place_family_members_display_name_length check (
    display_name is null or (char_length(trim(both from display_name)) >= 1 and char_length(trim(both from display_name)) <= 80)
  )
);
create unique index if not exists place_family_members_one_family_per_user on public.place_family_members (user_id);
create index if not exists place_family_members_user_idx on public.place_family_members (user_id, family_id);

create or replace function public.viktkollen_place_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists viktkollen_place_families_updated_at on public.place_families;
create trigger viktkollen_place_families_updated_at before update on public.place_families
for each row execute function public.viktkollen_place_touch_updated_at();

-- F13 tables from F22 metadata.
create table if not exists public.reminder_push_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_id text not null,
  title text not null,
  body text not null default 'Du har en påminnelse i Viktkollen.',
  schedule_type text not null,
  start_date date,
  reminder_time time,
  days_of_week text[] not null default '{}'::text[],
  interval_minutes integer not null default 0,
  timezone text not null default 'Europe/Stockholm',
  enabled boolean not null default true,
  paused boolean not null default false,
  archived boolean not null default false,
  snoozed_until timestamptz,
  next_run_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, reminder_id),
  constraint reminder_push_schedules_schedule_type_check check (schedule_type = any (array['once'::text, 'daily'::text, 'weekly'::text, 'selected_weekdays'::text, 'interval'::text, 'weekdays'::text, 'weekends'::text]))
);
create index if not exists reminder_push_schedules_due_idx on public.reminder_push_schedules (next_run_at)
  where enabled = true and paused = false and archived = false;

create or replace function public.viktkollen_set_reminder_schedule_owner()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  new.user_id := auth.uid();
  return new;
end;
$$;
drop trigger if exists reminder_schedule_owner on public.reminder_push_schedules;
create trigger reminder_schedule_owner before insert on public.reminder_push_schedules
for each row execute function public.viktkollen_set_reminder_schedule_owner();

create table if not exists public.place_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
create index if not exists place_push_subscriptions_user_id_idx on public.place_push_subscriptions (user_id);

create table if not exists public.place_location_history (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.place_families(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ciphertext text not null,
  iv_b64 text not null,
  salt_b64 text not null,
  share_with_family boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint place_location_history_expiry_after_create check (expires_at > created_at)
);
create index if not exists place_location_history_expires_idx on public.place_location_history (expires_at);
create index if not exists place_location_history_family_created_idx on public.place_location_history (family_id, created_at desc);
create index if not exists place_location_history_user_created_idx on public.place_location_history (user_id, created_at desc);

create table if not exists public.place_location_history_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  retention_minutes integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint place_location_history_settings_retention_minutes_check check (retention_minutes = any (array[0, 60, 120, 360, 1440, 10080, 43200]))
);

-- F14 and voice-call parent from F22/F23 metadata.
create table if not exists public.place_location_shares (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  family_id uuid not null references public.place_families(id) on delete cascade,
  consent_granted_at timestamptz,
  sharing_enabled boolean not null default false,
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  location_recorded_at timestamptz,
  updated_at timestamptz not null default now(),
  encrypted_payload text,
  encrypted_iv text,
  encrypted_key text,
  key_iv text,
  recipient_user_id uuid references auth.users(id),
  constraint place_location_accuracy_nonnegative check (accuracy_meters is null or accuracy_meters >= 0),
  constraint place_location_coordinates_pair check ((latitude is null) = (longitude is null)),
  constraint place_location_latitude_range check (latitude is null or (latitude >= -90 and latitude <= 90)),
  constraint place_location_longitude_range check (longitude is null or (longitude >= -180 and longitude <= 180)),
  constraint place_location_sharing_requires_consent check ((not sharing_enabled) or (consent_granted_at is not null))
);
create index if not exists place_location_shares_family_idx on public.place_location_shares (family_id, sharing_enabled, updated_at desc);
drop trigger if exists viktkollen_place_location_shares_updated_at on public.place_location_shares;
create trigger viktkollen_place_location_shares_updated_at before update on public.place_location_shares
for each row execute function public.viktkollen_place_touch_updated_at();

create table if not exists public.place_e2ee_live_locations (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid not null,
  encrypted_payload text not null,
  encrypted_iv text not null,
  location_recorded_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, recipient_user_id, family_id)
);
create index if not exists place_e2ee_live_locations_recipient_idx
  on public.place_e2ee_live_locations (recipient_user_id, family_id, location_recorded_at desc);

create table if not exists public.place_voice_calls (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  caller_user_id uuid not null references auth.users(id) on delete cascade,
  callee_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'ringing',
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  constraint place_voice_calls_different_users check (caller_user_id <> callee_user_id),
  constraint place_voice_calls_status_check check (status = any (array['ringing'::text, 'accepted'::text, 'ended'::text, 'declined'::text]))
);
create index if not exists place_voice_calls_users_idx on public.place_voice_calls (callee_user_id, created_at desc);

create table if not exists public.place_voice_call_signals (
  id bigint generated always as identity primary key,
  call_id uuid not null references public.place_voice_calls(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  signal_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint place_voice_call_signals_signal_type_check check (signal_type = any (array['offer'::text, 'answer'::text, 'ice'::text]))
);
create index if not exists place_voice_call_signals_call_idx on public.place_voice_call_signals (call_id, id);

-- RLS enabled to match F22/F23 status. Policies that need
-- viktkollen_is_place_family_member or place_trip_shares are omitted.
alter table public.place_families enable row level security;
alter table public.place_families force row level security;
alter table public.place_family_members enable row level security;
alter table public.place_family_members force row level security;
alter table public.place_location_shares enable row level security;
alter table public.place_location_shares force row level security;
alter table public.social_locations enable row level security;
alter table public.social_locations force row level security;
alter table public.place_e2ee_live_locations enable row level security;
alter table public.place_location_history enable row level security;
alter table public.place_location_history_settings enable row level security;
alter table public.place_push_subscriptions enable row level security;
alter table public.place_voice_call_signals enable row level security;
alter table public.place_voice_calls enable row level security;
alter table public.reminder_push_schedules enable row level security;

-- Account-deletion social purge, policy C.
-- Function only. Does not create or alter social tables.
-- Local migration only. DO NOT apply to production until reviewed.

create or replace function public.social_purge_user_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null then
    raise exception 'invalid user';
  end if;
  if auth.role() is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;

  delete from public.social_messages
  where sender_id = p_user_id;

  delete from public.social_conversation_members
  where user_id = p_user_id;

  delete from public.social_dm_pairs
  where user_low = p_user_id
     or user_high = p_user_id;

  delete from public.social_location_envelopes
  where owner_user_id = p_user_id
     or recipient_user_id = p_user_id;

  delete from public.social_locations
  where user_id = p_user_id;

  delete from public.social_friend_requests
  where from_user_id = p_user_id
     or to_user_id = p_user_id;

  delete from public.social_friendships
  where user_low = p_user_id
     or user_high = p_user_id;

  delete from public.social_blocks
  where blocker_id = p_user_id
     or blocked_id = p_user_id;

  delete from public.social_public_profiles
  where user_id = p_user_id;
end;
$$;

revoke all on function public.social_purge_user_data(uuid) from public;
revoke all on function public.social_purge_user_data(uuid) from anon;
revoke all on function public.social_purge_user_data(uuid) from authenticated;
grant execute on function public.social_purge_user_data(uuid) to service_role;

comment on function public.social_purge_user_data(uuid) is
  'Account purge policy C: removes the departing user''s social rows and DM index. Keeps the conversation, the other participant''s messages and membership, and the shared conversation key.';

-- Account-deletion exclusive-row purge.
-- Function only. Does not create or alter tables and does not change
-- private.delete_user_backup_secret.
-- Local migration only. DO NOT apply to production until reviewed.

create or replace function public.purge_exclusive_user_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null then
    raise exception 'invalid user';
  end if;
  if auth.role() is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;

  delete from public.reminder_push_schedules
  where user_id = p_user_id;

  delete from public.place_push_subscriptions
  where user_id = p_user_id;

  delete from public.place_location_history
  where user_id = p_user_id;

  delete from public.place_location_history_settings
  where user_id = p_user_id;

  delete from private.user_backup_keys
  where user_id = p_user_id;
end;
$$;

revoke all on function public.purge_exclusive_user_data(uuid) from public;
revoke all on function public.purge_exclusive_user_data(uuid) from anon;
revoke all on function public.purge_exclusive_user_data(uuid) from authenticated;
grant execute on function public.purge_exclusive_user_data(uuid) to service_role;

comment on function public.purge_exclusive_user_data(uuid) is
  'Deletes one verified user''s exclusive reminder, push, location-history, and backup-key rows. The existing backup-key trigger removes that row''s Vault secret.';

-- Account-deletion place-participation purge.
-- Function only. Does not delete envelopes, keys, family rows, or call rows.
-- Local migration only. DO NOT apply to production until reviewed.

create or replace function public.purge_place_participation(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null then
    raise exception 'invalid user';
  end if;
  if auth.role() is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;

  delete from public.place_location_shares
  where user_id = p_user_id;

  delete from public.place_e2ee_live_locations
  where owner_user_id = p_user_id
     or recipient_user_id = p_user_id;

  delete from public.place_voice_call_signals
  where sender_user_id = p_user_id;
end;
$$;

revoke all on function public.purge_place_participation(uuid) from public;
revoke all on function public.purge_place_participation(uuid) from anon;
revoke all on function public.purge_place_participation(uuid) from authenticated;
grant execute on function public.purge_place_participation(uuid) to service_role;

comment on function public.purge_place_participation(uuid) is
  'Deletes one verified user''s own location-share row, live-location copies, and voice-call signals. Does not delete envelopes or keys.';

-- Account-deletion family-membership purge.
-- Function only. Transfers place_families.created_by to a remaining
-- guardian, then deletes only the departing user's membership.
-- Local migration only. DO NOT apply to production until reviewed.

create or replace function public.purge_family_membership(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_family_id uuid;
  v_created_by uuid;
  v_successor uuid;
  v_verified_created_by uuid;
  v_successor_still_member boolean;
begin
  if p_user_id is null then
    raise exception 'invalid user';
  end if;
  if auth.role() is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;

  for v_family_id in
    select m.family_id
    from public.place_family_members m
    where m.user_id = p_user_id
    order by m.family_id asc
  loop
    select f.created_by
      into v_created_by
    from public.place_families f
    where f.id = v_family_id
    for update;

    if not found then
      raise exception 'family missing';
    end if;

    perform 1
    from public.place_family_members m
    where m.family_id = v_family_id
    order by m.user_id asc
    for update;

    if v_created_by = p_user_id then
      select m.user_id
        into v_successor
      from public.place_family_members m
      where m.family_id = v_family_id
        and m.user_id <> p_user_id
        and m.role = 'guardian'
      order by m.joined_at asc, m.user_id asc
      limit 1;

      if v_successor is null then
        raise exception 'no remaining guardian';
      end if;

      update public.place_families
      set created_by = v_successor
      where id = v_family_id
        and created_by = p_user_id;

      select f.created_by
        into v_verified_created_by
      from public.place_families f
      where f.id = v_family_id;

      select exists (
        select 1
        from public.place_family_members m
        where m.family_id = v_family_id
          and m.user_id = v_successor
      )
      into v_successor_still_member;

      if v_verified_created_by is distinct from v_successor
         or v_successor_still_member is not true then
        raise exception 'ownership transfer failed';
      end if;
    elsif v_created_by is null then
      raise exception 'invalid family';
    end if;

    delete from public.place_family_members
    where family_id = v_family_id
      and user_id = p_user_id;
  end loop;
end;
$$;

revoke all on function public.purge_family_membership(uuid) from public;
revoke all on function public.purge_family_membership(uuid) from anon;
revoke all on function public.purge_family_membership(uuid) from authenticated;
grant execute on function public.purge_family_membership(uuid) to service_role;

comment on function public.purge_family_membership(uuid) is
  'Removes one verified user''s family membership after transferring created_by to a remaining guardian when that user created the family.';

-- Account-deletion atomic database cleanup.
-- Function only. Calls the existing purge functions and deletes the
-- sync and backup rows in one transaction.
-- Local migration only. DO NOT apply to production until reviewed.

create or replace function public.purge_account_user_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null then
    raise exception 'invalid user';
  end if;
  if auth.role() is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;

  perform public.purge_family_membership(p_user_id);
  perform public.social_purge_user_data(p_user_id);

  delete from public.user_sync_items
  where user_id = p_user_id;

  delete from public.user_sync_events
  where user_id = p_user_id;

  delete from public.user_sync_state
  where user_id = p_user_id;

  delete from public.user_backups
  where user_id = p_user_id;

  perform public.purge_exclusive_user_data(p_user_id);
  perform public.purge_place_participation(p_user_id);
end;
$$;

revoke all on function public.purge_account_user_data(uuid) from public;
revoke all on function public.purge_account_user_data(uuid) from anon;
revoke all on function public.purge_account_user_data(uuid) from authenticated;
grant execute on function public.purge_account_user_data(uuid) to service_role;

comment on function public.purge_account_user_data(uuid) is
  'Deletes one verified user''s account data in one database transaction. An error from any step rolls the whole call back.';
