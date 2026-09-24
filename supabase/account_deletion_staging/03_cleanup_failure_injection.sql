-- TEST ONLY. Safe to run after a failed or successful harness test.
-- NEVER RUN AGAINST PRODUCTION OR BILLING-STAGING.

drop trigger if exists account_deletion_test_only_fail_policy_c on public.social_messages;
drop trigger if exists account_deletion_test_only_fail_sync on public.user_sync_items;
drop trigger if exists account_deletion_test_only_fail_f13 on public.reminder_push_schedules;
drop trigger if exists account_deletion_test_only_fail_f14 on public.place_location_shares;
drop function if exists public.account_deletion_test_only_fail_delete();
