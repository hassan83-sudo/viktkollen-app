-- TEST ONLY. Safe after any one of the four failure points.
-- NEVER RUN AGAINST PRODUCTION OR BILLING-STAGING.
-- Does not set viktkollen.account_deletion_harness.

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
drop function if exists public.account_deletion_test_only_fail_delete();
drop function if exists public.account_deletion_test_only_assert_baseline();

delete from vault.secrets
where name = 'f26-synthetic-account-deletion-backup-key';
