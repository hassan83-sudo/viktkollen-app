-- TEST ONLY. NEVER RUN AGAINST PRODUCTION OR BILLING-STAGING.
-- Staging harness triggers. They are not Production objects.

create or replace function public.account_deletion_test_only_fail_delete()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'social_messages' and old.sender_id = '11111111-1111-4111-8111-111111111111'::uuid then
    raise exception 'TEST ONLY failure injection';
  end if;
  if tg_table_name in ('user_sync_items', 'reminder_push_schedules', 'place_location_shares')
     and old.user_id = '11111111-1111-4111-8111-111111111111'::uuid then
    raise exception 'TEST ONLY failure injection';
  end if;
  return old;
end;
$$;

drop trigger if exists account_deletion_test_only_fail_policy_c on public.social_messages;
create trigger account_deletion_test_only_fail_policy_c
before delete on public.social_messages
for each row execute function public.account_deletion_test_only_fail_delete();

drop trigger if exists account_deletion_test_only_fail_sync on public.user_sync_items;
create trigger account_deletion_test_only_fail_sync
before delete on public.user_sync_items
for each row execute function public.account_deletion_test_only_fail_delete();

drop trigger if exists account_deletion_test_only_fail_f13 on public.reminder_push_schedules;
create trigger account_deletion_test_only_fail_f13
before delete on public.reminder_push_schedules
for each row execute function public.account_deletion_test_only_fail_delete();

drop trigger if exists account_deletion_test_only_fail_f14 on public.place_location_shares;
create trigger account_deletion_test_only_fail_f14
before delete on public.place_location_shares
for each row execute function public.account_deletion_test_only_fail_delete();
