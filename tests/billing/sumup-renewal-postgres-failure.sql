begin;
create function billing.reject_failed_attempt_for_test() returns trigger language plpgsql as $$
begin
  if new.status = 'failed' then raise exception 'forced_attempt_write_failure'; end if;
  return new;
end $$;
do $test$
declare result jsonb;
begin
  perform billing.claim_sumup_renewal_attempt('renewal-failure', 'sub-1', '2026-10-01Z');
  perform billing.bind_sumup_renewal_checkout_draft(
    'renewal-failure', 'checkout-failure', 'sub-1', '2026-10-01Z', '2026-11-01Z');
  begin
    perform billing.record_verified_sumup_renewal_failure_draft('renewal-failure', 'sub-1', '2026-10-01Z', 'wrong');
    raise exception 'wrong checkout accepted';
  exception when others then
    if sqlerrm <> 'renewal_failure_conflict' then raise; end if;
  end;
  if exists (select 1 from billing.subscription_events) then raise exception 'invalid failure changed lifecycle'; end if;
  update billing.subscriptions set cancel_at_period_end = true;
  begin
    perform billing.record_verified_sumup_renewal_failure_draft('renewal-failure', 'sub-1', '2026-10-01Z', 'checkout-failure');
    raise exception 'cancelled subscription accepted';
  exception when others then
    if sqlerrm <> 'renewal_failure_conflict' then raise; end if;
  end;
  update billing.subscriptions set cancel_at_period_end = false;
  execute 'create trigger reject_failed_attempt_for_test before update on billing.sumup_renewal_attempts
    for each row execute function billing.reject_failed_attempt_for_test()';
  begin
    perform billing.record_verified_sumup_renewal_failure_draft('renewal-failure', 'sub-1', '2026-10-01Z', 'checkout-failure');
    raise exception 'forced failure did not abort';
  exception when others then
    if sqlerrm <> 'forced_attempt_write_failure' then raise; end if;
  end;
  execute 'drop trigger reject_failed_attempt_for_test on billing.sumup_renewal_attempts';
  if exists (select 1 from billing.subscription_events)
     or exists (select 1 from billing.subscriptions where status <> 'ACTIVE')
     or exists (select 1 from billing.sumup_renewal_attempts where status <> 'processing') then
    raise exception 'failure was partially committed';
  end if;
  result := billing.record_verified_sumup_renewal_failure_draft('renewal-failure', 'sub-1', '2026-10-01Z', 'checkout-failure');
  if result->>'recorded' is distinct from 'true'
     or not exists (select 1 from billing.subscriptions where status = 'PAST_DUE'
       and current_period_end = '2026-10-01Z'::timestamptz and past_due_grace_until = '2026-10-08Z'::timestamptz)
     or not exists (select 1 from billing.sumup_renewal_attempts where status = 'failed')
     or (select count(*) from billing.subscription_events where operation = 'renewal.failed') <> 1 then
    raise exception 'failure lifecycle not recorded atomically';
  end if;
  result := billing.record_verified_sumup_renewal_failure_draft('renewal-failure', 'sub-1', '2026-10-01Z', 'checkout-failure');
  if result->>'already_recorded' is distinct from 'true'
     or (select count(*) from billing.subscription_events) <> 1 then raise exception 'failure replay not idempotent'; end if;
  if exists (select 1 from billing.list_sumup_renewal_work_draft(20)) then raise exception 'failed attempt scheduled again'; end if;
  if has_function_privilege('service_role', 'billing.record_verified_sumup_renewal_failure_draft(text,text,timestamptz,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'billing.record_verified_sumup_renewal_failure_draft(text,text,timestamptz,text)', 'EXECUTE')
     or has_function_privilege('anon', 'billing.record_verified_sumup_renewal_failure_draft(text,text,timestamptz,text)', 'EXECUTE') then
    raise exception 'failure writer publicly executable';
  end if;
end;
$test$;
rollback;

-- Existing PAST_DUE grace and pending plan remain unchanged.
begin;
update billing.subscriptions set status = 'PAST_DUE', past_due_grace_until = '2026-10-05Z';
select billing.claim_sumup_renewal_attempt('renewal-existing-grace', 'sub-1', '2026-10-01Z');
select billing.bind_sumup_renewal_checkout_draft('renewal-existing-grace', 'checkout-grace', 'sub-1', '2026-10-01Z', '2026-11-01Z');
update billing.subscriptions set pending_plan_id = 'future-plan', pending_plan_change = 'next_period';
select billing.record_verified_sumup_renewal_failure_draft('renewal-existing-grace', 'sub-1', '2026-10-01Z', 'checkout-grace');
do $$ begin
  if not exists (select 1 from billing.subscriptions where past_due_grace_until = '2026-10-05Z'::timestamptz
    and pending_plan_id = 'future-plan' and pending_plan_change = 'next_period'
    and current_period_end = '2026-10-01Z'::timestamptz) then raise exception 'failure overwrote grace or plan'; end if;
end $$;
rollback;
