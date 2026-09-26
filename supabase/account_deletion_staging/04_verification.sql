-- HARD WARNING: TEST/STAGING ONLY.
-- NEVER RUN AGAINST PRODUCTION.
-- NEVER RUN AGAINST BILLING-STAGING.
-- Does not set viktkollen.account_deletion_harness.
-- Does not call auth.admin.deleteUser.
-- Each failing scenario sets a transaction-local service_role claim and
-- calls purge_account_user_data in that same transaction. An HTTP
-- service_role RPC is the API-boundary method and must target only the
-- isolated project. Do not run this as postgres without that claim.

do $account_deletion_harness_guard$
begin
  if current_setting('viktkollen.account_deletion_harness', true) is distinct from 'isolated-app-staging' then
    raise exception 'refusing to run without viktkollen.account_deletion_harness=isolated-app-staging';
  end if;
end
$account_deletion_harness_guard$;

drop trigger if exists account_deletion_test_only_fail_policy_c on public.social_messages;
drop trigger if exists account_deletion_test_only_fail_sync on public.user_sync_items;
drop trigger if exists account_deletion_test_only_fail_f13 on public.reminder_push_schedules;
drop trigger if exists account_deletion_test_only_fail_f14 on public.place_location_shares;

create or replace function public.account_deletion_test_only_assert_baseline()
returns void
language plpgsql
as $$
begin
  if not exists (select 1 from auth.users where id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'baseline failed: auth user A missing';
  end if;
  if (select created_by from public.place_families where id = '44444444-4444-4444-8444-444444444444')
     is distinct from '11111111-1111-4111-8111-111111111111'::uuid then
    raise exception 'baseline failed: created_by is not A';
  end if;
  if (select count(*) from public.place_family_members where family_id = '44444444-4444-4444-8444-444444444444' and user_id = '11111111-1111-4111-8111-111111111111') <> 1 then
    raise exception 'baseline failed: A membership missing';
  end if;
  if (select count(*) from public.place_family_members where family_id = '44444444-4444-4444-8444-444444444444' and user_id = '22222222-2222-4222-8222-222222222222') <> 1 then
    raise exception 'baseline failed: B membership missing';
  end if;
  if (select count(*) from public.social_messages where sender_id = '11111111-1111-4111-8111-111111111111') <> 1 then
    raise exception 'baseline failed: A social message missing';
  end if;
  if (select count(*) from public.social_messages where sender_id = '22222222-2222-4222-8222-222222222222') <> 1 then
    raise exception 'baseline failed: B social message missing';
  end if;
  if (select count(*) from public.user_sync_items where user_id = '11111111-1111-4111-8111-111111111111') <> 1 then
    raise exception 'baseline failed: A sync item missing';
  end if;
  if (select count(*) from public.user_sync_items where user_id = '33333333-3333-4333-8333-333333333333') <> 1 then
    raise exception 'baseline failed: C sync item missing';
  end if;
  if (select count(*) from public.user_backups where user_id = '11111111-1111-4111-8111-111111111111') <> 1 then
    raise exception 'baseline failed: A backup missing';
  end if;
  if (select count(*) from private.user_backup_keys where user_id = '11111111-1111-4111-8111-111111111111') <> 1 then
    raise exception 'baseline failed: backup key missing';
  end if;
  if not exists (select 1 from vault.secrets where name = 'f26-synthetic-account-deletion-backup-key') then
    raise exception 'baseline failed: synthetic vault secret missing';
  end if;
  if (select count(*) from public.reminder_push_schedules where user_id = '11111111-1111-4111-8111-111111111111') <> 1 then
    raise exception 'baseline failed: reminder missing';
  end if;
  if (select count(*) from public.place_location_shares where user_id = '11111111-1111-4111-8111-111111111111') <> 1 then
    raise exception 'baseline failed: location share missing';
  end if;
  if (select count(*) from public.place_voice_calls where id = '66666666-6666-4666-8666-666666666666') <> 1 then
    raise exception 'baseline failed: voice call missing';
  end if;
  if (select count(*) from public.place_voice_call_signals where sender_user_id = '11111111-1111-4111-8111-111111111111') <> 1 then
    raise exception 'baseline failed: voice signal missing';
  end if;
end;
$$;

select public.account_deletion_test_only_assert_baseline();

do $guardian$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  delete from public.place_family_members
  where user_id = '11111111-1111-4111-8111-111111111111'
    and family_id = '44444444-4444-4444-8444-444444444444';
  insert into public.place_families (id, created_by)
  values ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111');
  insert into public.place_family_members (family_id, user_id, role)
  values ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'guardian');
  perform public.purge_account_user_data('11111111-1111-4111-8111-111111111111');
  raise exception 'expected guardian failure missing';
exception
  when others then
    if sqlerrm is distinct from 'no remaining guardian' then
      raise;
    end if;
end
$guardian$;

select public.account_deletion_test_only_assert_baseline();

do $policy_c$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  create or replace function public.account_deletion_test_only_fail_delete()
  returns trigger language plpgsql as $fn$
  begin
    if old.sender_id = '11111111-1111-4111-8111-111111111111'::uuid then
      raise exception 'TEST ONLY failure injection';
    end if;
    return old;
  end
  $fn$;
  create trigger account_deletion_test_only_fail_policy_c
  before delete on public.social_messages
  for each row execute function public.account_deletion_test_only_fail_delete();
  perform public.purge_account_user_data('11111111-1111-4111-8111-111111111111');
  raise exception 'expected policy_c failure missing';
exception
  when others then
    if sqlerrm is distinct from 'TEST ONLY failure injection' then
      raise;
    end if;
end
$policy_c$;

select public.account_deletion_test_only_assert_baseline();

do $sync_failure$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  create or replace function public.account_deletion_test_only_fail_delete()
  returns trigger language plpgsql as $fn$
  begin
    if old.user_id = '11111111-1111-4111-8111-111111111111'::uuid then
      raise exception 'TEST ONLY failure injection';
    end if;
    return old;
  end
  $fn$;
  create trigger account_deletion_test_only_fail_sync
  before delete on public.user_sync_items
  for each row execute function public.account_deletion_test_only_fail_delete();
  perform public.purge_account_user_data('11111111-1111-4111-8111-111111111111');
  raise exception 'expected sync failure missing';
exception
  when others then
    if sqlerrm is distinct from 'TEST ONLY failure injection' then
      raise;
    end if;
end
$sync_failure$;

select public.account_deletion_test_only_assert_baseline();

do $f13_failure$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  create or replace function public.account_deletion_test_only_fail_delete()
  returns trigger language plpgsql as $fn$
  begin
    if old.user_id = '11111111-1111-4111-8111-111111111111'::uuid then
      raise exception 'TEST ONLY failure injection';
    end if;
    return old;
  end
  $fn$;
  create trigger account_deletion_test_only_fail_f13
  before delete on public.reminder_push_schedules
  for each row execute function public.account_deletion_test_only_fail_delete();
  perform public.purge_account_user_data('11111111-1111-4111-8111-111111111111');
  raise exception 'expected f13 failure missing';
exception
  when others then
    if sqlerrm is distinct from 'TEST ONLY failure injection' then
      raise;
    end if;
end
$f13_failure$;

select public.account_deletion_test_only_assert_baseline();

do $f14_failure$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  create or replace function public.account_deletion_test_only_fail_delete()
  returns trigger language plpgsql as $fn$
  begin
    if old.user_id = '11111111-1111-4111-8111-111111111111'::uuid then
      raise exception 'TEST ONLY failure injection';
    end if;
    return old;
  end
  $fn$;
  create trigger account_deletion_test_only_fail_f14
  before delete on public.place_location_shares
  for each row execute function public.account_deletion_test_only_fail_delete();
  perform public.purge_account_user_data('11111111-1111-4111-8111-111111111111');
  raise exception 'expected f14 failure missing';
exception
  when others then
    if sqlerrm is distinct from 'TEST ONLY failure injection' then
      raise;
    end if;
end
$f14_failure$;

select public.account_deletion_test_only_assert_baseline();

do $success$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.purge_account_user_data('11111111-1111-4111-8111-111111111111');
  if (select created_by from public.place_families where id = '44444444-4444-4444-8444-444444444444')
     is distinct from '22222222-2222-4222-8222-222222222222'::uuid then
    raise exception 'success failed: created_by is not B';
  end if;
  if exists (select 1 from public.place_family_members where user_id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'success failed: A membership remains';
  end if;
  if not exists (select 1 from public.place_family_members where user_id = '22222222-2222-4222-8222-222222222222') then
    raise exception 'success failed: B membership missing';
  end if;
  if not exists (select 1 from public.social_messages where sender_id = '22222222-2222-4222-8222-222222222222') then
    raise exception 'success failed: B message missing';
  end if;
  if not exists (select 1 from public.user_sync_items where user_id = '33333333-3333-4333-8333-333333333333') then
    raise exception 'success failed: C sync item missing';
  end if;
  if not exists (select 1 from public.place_voice_calls where id = '66666666-6666-4666-8666-666666666666') then
    raise exception 'success failed: voice call missing';
  end if;
  if exists (select 1 from public.user_sync_items where user_id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'success failed: A sync item remains';
  end if;
  if exists (select 1 from private.user_backup_keys where user_id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'success failed: backup key remains';
  end if;
  if exists (select 1 from vault.secrets where name = 'f26-synthetic-account-deletion-backup-key') then
    raise exception 'success failed: synthetic vault secret remains';
  end if;
  if not exists (select 1 from auth.users where id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'success failed: auth user A was deleted';
  end if;
  perform public.purge_account_user_data('11111111-1111-4111-8111-111111111111');
  if exists (select 1 from public.place_family_members where user_id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'second run failed: A membership returned';
  end if;
  if (select created_by from public.place_families where id = '44444444-4444-4444-8444-444444444444')
     is distinct from '22222222-2222-4222-8222-222222222222'::uuid then
    raise exception 'second run failed: created_by changed';
  end if;
  if not exists (select 1 from public.user_sync_items where user_id = '33333333-3333-4333-8333-333333333333') then
    raise exception 'second run failed: C sync item missing';
  end if;
  if not exists (select 1 from public.place_voice_calls where id = '66666666-6666-4666-8666-666666666666') then
    raise exception 'second run failed: voice call missing';
  end if;
end
$success$;

drop function if exists public.account_deletion_test_only_assert_baseline();
drop function if exists public.account_deletion_test_only_fail_delete();
