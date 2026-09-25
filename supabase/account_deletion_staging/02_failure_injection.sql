-- TEST ONLY. NEVER RUN AGAINST PRODUCTION OR BILLING-STAGING.
-- Installs exactly one failure trigger. The session must already have
-- viktkollen.account_deletion_harness=isolated-app-staging
-- and viktkollen.account_deletion_failure_point set to one of:
-- policy_c, sync, f13, f14.
-- This file does not set the harness marker.

do $account_deletion_harness_guard$
begin
  if current_setting('viktkollen.account_deletion_harness', true) is distinct from 'isolated-app-staging' then
    raise exception 'refusing to run without viktkollen.account_deletion_harness=isolated-app-staging';
  end if;
end
$account_deletion_harness_guard$;

do $account_deletion_failure_point$
declare
  failure_point text := current_setting('viktkollen.account_deletion_failure_point', true);
begin
  if failure_point is null or failure_point not in ('policy_c', 'sync', 'f13', 'f14') then
    raise exception 'missing or unknown viktkollen.account_deletion_failure_point';
  end if;

  drop trigger if exists account_deletion_test_only_fail_policy_c on public.social_messages;
  drop trigger if exists account_deletion_test_only_fail_sync on public.user_sync_items;
  drop trigger if exists account_deletion_test_only_fail_f13 on public.reminder_push_schedules;
  drop trigger if exists account_deletion_test_only_fail_f14 on public.place_location_shares;

  create or replace function public.account_deletion_test_only_fail_delete()
  returns trigger
  language plpgsql
  as $fn$
  begin
    if tg_table_name = 'social_messages' then
      if old.sender_id = '11111111-1111-4111-8111-111111111111'::uuid then
        raise exception 'TEST ONLY failure injection';
      end if;
    elsif tg_table_name = 'user_sync_items' then
      if old.user_id = '11111111-1111-4111-8111-111111111111'::uuid then
        raise exception 'TEST ONLY failure injection';
      end if;
    elsif tg_table_name = 'reminder_push_schedules' then
      if old.user_id = '11111111-1111-4111-8111-111111111111'::uuid then
        raise exception 'TEST ONLY failure injection';
      end if;
    elsif tg_table_name = 'place_location_shares' then
      if old.user_id = '11111111-1111-4111-8111-111111111111'::uuid then
        raise exception 'TEST ONLY failure injection';
      end if;
    end if;
    return old;
  end;
  $fn$;

  if failure_point = 'policy_c' then
    create trigger account_deletion_test_only_fail_policy_c
    before delete on public.social_messages
    for each row execute function public.account_deletion_test_only_fail_delete();
  elsif failure_point = 'sync' then
    create trigger account_deletion_test_only_fail_sync
    before delete on public.user_sync_items
    for each row execute function public.account_deletion_test_only_fail_delete();
  elsif failure_point = 'f13' then
    create trigger account_deletion_test_only_fail_f13
    before delete on public.reminder_push_schedules
    for each row execute function public.account_deletion_test_only_fail_delete();
  elsif failure_point = 'f14' then
    create trigger account_deletion_test_only_fail_f14
    before delete on public.place_location_shares
    for each row execute function public.account_deletion_test_only_fail_delete();
  end if;
end
$account_deletion_failure_point$;
