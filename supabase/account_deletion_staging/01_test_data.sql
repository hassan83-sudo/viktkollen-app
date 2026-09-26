-- TEST/STAGING ONLY. NEVER RUN AGAINST PRODUCTION OR BILLING-STAGING.
-- Run this file as one session script. It opens a transaction after the guard.
-- DISABLE TRIGGER is transactional. If a later statement fails, ROLLBACK in
-- this session restores the previous trigger state. A successful COMMIT
-- leaves the triggers enabled.
-- This file does not set viktkollen.account_deletion_harness.

do $account_deletion_harness_guard$
begin
  if current_setting('viktkollen.account_deletion_harness', true) is distinct from 'isolated-app-staging' then
    raise exception 'refusing to run without viktkollen.account_deletion_harness=isolated-app-staging';
  end if;
end
$account_deletion_harness_guard$;

begin;

do $check_users$
begin
  if not exists (select 1 from auth.users where id = '11111111-1111-4111-8111-111111111111'::uuid) then
    raise exception 'missing synthetic auth user A';
  end if;
  if not exists (select 1 from auth.users where id = '22222222-2222-4222-8222-222222222222'::uuid) then
    raise exception 'missing synthetic auth user B';
  end if;
  if not exists (select 1 from auth.users where id = '33333333-3333-4333-8333-333333333333'::uuid) then
    raise exception 'missing synthetic auth user C';
  end if;
end
$check_users$;

delete from public.place_voice_call_signals
where call_id = '66666666-6666-4666-8666-666666666666';
delete from public.place_voice_calls
where id = '66666666-6666-4666-8666-666666666666';
delete from public.place_e2ee_live_locations
where family_id = '44444444-4444-4444-8444-444444444444';
delete from public.place_location_shares
where user_id = '11111111-1111-4111-8111-111111111111';
delete from public.place_location_history
where user_id = '11111111-1111-4111-8111-111111111111';
delete from public.place_location_history_settings
where user_id = '11111111-1111-4111-8111-111111111111';
delete from public.place_push_subscriptions
where user_id = '11111111-1111-4111-8111-111111111111';
delete from public.reminder_push_schedules
where user_id = '11111111-1111-4111-8111-111111111111';
delete from public.user_sync_items
where user_id in ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333');
delete from public.user_sync_events
where user_id = '11111111-1111-4111-8111-111111111111';
delete from public.user_sync_state
where user_id = '11111111-1111-4111-8111-111111111111';
delete from public.user_backups
where user_id = '11111111-1111-4111-8111-111111111111';
delete from private.user_backup_keys
where user_id = '11111111-1111-4111-8111-111111111111';
delete from vault.secrets
where name = 'f26-synthetic-account-deletion-backup-key';
delete from public.social_messages
where conversation_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
delete from public.social_dm_pairs
where conversation_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
delete from public.social_conversation_members
where conversation_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
delete from public.social_conversations
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
delete from public.social_friendships
where user_low = '11111111-1111-4111-8111-111111111111';
delete from public.social_friend_requests
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
delete from public.social_blocks
where blocker_id = '11111111-1111-4111-8111-111111111111';
delete from public.social_location_envelopes
where owner_user_id = '11111111-1111-4111-8111-111111111111';
delete from public.social_locations
where user_id = '11111111-1111-4111-8111-111111111111';
delete from public.social_public_profiles
where user_id in ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333');
delete from public.place_family_members
where family_id = '44444444-4444-4444-8444-444444444444';
delete from public.place_families
where id = '44444444-4444-4444-8444-444444444444';

alter table public.user_backups disable trigger viktkollen_user_backups_owner;
alter table public.user_sync_state disable trigger viktkollen_user_sync_state_owner;
alter table public.user_sync_events disable trigger viktkollen_user_sync_events_owner;
alter table public.user_sync_items disable trigger viktkollen_user_sync_items_owner;
alter table public.reminder_push_schedules disable trigger reminder_schedule_owner;

insert into public.place_families (id, created_by)
values ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111');

insert into public.place_family_members (family_id, user_id, role, joined_at)
values
  ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 'guardian', '2026-01-01T00:00:00Z'),
  ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'guardian', '2026-01-02T00:00:00Z');

insert into public.social_public_profiles (user_id, username, display_name)
values
  ('11111111-1111-4111-8111-111111111111', 'f24_user_a', 'F24 A'),
  ('33333333-3333-4333-8333-333333333333', 'f24_user_c', 'F24 C');

insert into public.social_blocks (blocker_id, blocked_id)
values ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333');

insert into public.social_friend_requests (id, from_user_id, to_user_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');

insert into public.social_friendships (user_low, user_high)
values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');

insert into public.social_conversations (id)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1');

insert into public.social_conversation_members (conversation_id, user_id)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '22222222-2222-4222-8222-222222222222');

insert into public.social_dm_pairs (user_low, user_high, conversation_id)
values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1');

insert into public.social_messages (id, conversation_id, sender_id, body)
values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '11111111-1111-4111-8111-111111111111', 'f24 synthetic'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '22222222-2222-4222-8222-222222222222', 'f24 synthetic other');

insert into public.social_location_envelopes (owner_user_id, recipient_user_id, recipient_device_id, sender_device_id, encrypted_payload, encrypted_iv)
values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'f24-device', 'f24-device', 'synthetic', 'synthetic');

insert into public.social_locations (user_id, enabled)
values ('11111111-1111-4111-8111-111111111111', false);

insert into public.user_backups (id, user_id, payload)
values ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', '11111111-1111-4111-8111-111111111111', '{"synthetic":true}'::jsonb);

insert into public.user_sync_state (user_id, latest_backup_id)
values ('11111111-1111-4111-8111-111111111111', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1');

insert into public.user_sync_events (id, user_id, event_type, status)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', '11111111-1111-4111-8111-111111111111', 'f24', 'synthetic');

insert into public.user_sync_items (id, user_id, storage_key, payload)
values
  ('ffffffff-ffff-4fff-8fff-fffffffffff1', '11111111-1111-4111-8111-111111111111', 'f24.synthetic', '{"synthetic":true}'::jsonb),
  ('ffffffff-ffff-4fff-8fff-fffffffffff2', '33333333-3333-4333-8333-333333333333', 'f24.keep', '{"synthetic":true}'::jsonb);

insert into public.reminder_push_schedules (id, user_id, reminder_id, title, schedule_type)
values ('12121212-1212-4121-8121-121212121212', '11111111-1111-4111-8111-111111111111', 'f24', 'F24', 'once');

insert into public.place_push_subscriptions (id, user_id, endpoint, p256dh, auth_key)
values ('13131313-1313-4131-8131-131313131313', '11111111-1111-4111-8111-111111111111', 'https://push.invalid/f24-a', 'synthetic', 'synthetic');

insert into public.place_location_history (id, family_id, user_id, ciphertext, iv_b64, salt_b64, created_at, expires_at)
values ('14141414-1414-4141-8141-141414141414', '44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'synthetic', 'synthetic', 'synthetic', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');

insert into public.place_location_history_settings (user_id, retention_minutes)
values ('11111111-1111-4111-8111-111111111111', 0);

insert into public.place_location_shares (user_id, family_id, sharing_enabled)
values ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444444', false);

insert into public.place_e2ee_live_locations (owner_user_id, recipient_user_id, family_id, encrypted_payload, encrypted_iv, location_recorded_at)
values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'synthetic', 'synthetic', '2026-01-01T00:00:00Z');

insert into public.place_voice_calls (id, family_id, caller_user_id, callee_user_id, status)
values ('66666666-6666-4666-8666-666666666666', '44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'ended');

insert into public.place_voice_call_signals (call_id, sender_user_id, signal_type, payload)
values ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 'offer', '{"synthetic":true}'::jsonb);

do $vault_secret$
declare
  secret_id uuid;
begin
  select vault.create_secret(
    'f26-synthetic-backup-key-value',
    'f26-synthetic-account-deletion-backup-key',
    'F26 synthetic account-deletion test secret',
    null
  )
  into secret_id;

  insert into private.user_backup_keys (user_id, secret_id)
  values ('11111111-1111-4111-8111-111111111111', secret_id);
end
$vault_secret$;

alter table public.user_backups enable trigger viktkollen_user_backups_owner;
alter table public.user_sync_state enable trigger viktkollen_user_sync_state_owner;
alter table public.user_sync_events enable trigger viktkollen_user_sync_events_owner;
alter table public.user_sync_items enable trigger viktkollen_user_sync_items_owner;
alter table public.reminder_push_schedules enable trigger reminder_schedule_owner;

commit;
