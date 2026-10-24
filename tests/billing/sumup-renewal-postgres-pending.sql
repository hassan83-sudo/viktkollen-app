begin;
insert into billing.plans values ('pending-target', 900, 'SEK', 2, true), ('same-price-other', 900, 'SEK', 3, true);
insert into billing.subscriptions
  (subscription_id, user_id, plan_id, provider, status, provider_customer_ref, plan_version, current_period_end, pending_plan_id, pending_plan_change)
values ('sub-pending', 'pending-user', 'plan-1', 'sumup', 'ACTIVE', 'pending-customer', 1, '2026-10-01Z', 'pending-target', 'next_period');
insert into billing.sumup_recurring_instruments
  (subscription_id, user_id, provider_customer_ref, status, instrument_fingerprint)
values ('sub-pending', 'pending-user', 'pending-customer', 'verified', repeat('b',64));

do $test$
declare result jsonb;
begin
  if not exists (select 1 from billing.list_sumup_renewal_work_draft(20)
    where subscription_id = 'sub-pending' and amount_minor = 900) then
    raise exception 'pending plan not priced from target';
  end if;
  perform billing.claim_sumup_renewal_attempt('pending-reference', 'sub-pending', '2026-10-01Z');
  perform billing.bind_sumup_renewal_checkout_draft('pending-reference', 'pending-checkout', 'sub-pending', '2026-10-01Z', '2026-11-01Z');
  if not exists (select 1 from billing.sumup_renewal_attempts where checkout_reference = 'pending-reference'
    and expected_plan_id = 'pending-target' and expected_plan_version = 2 and expected_amount_minor = 900) then
    raise exception 'pending plan snapshot missing';
  end if;

  -- A different plan at the same price cannot replace the one paid for.
  update billing.subscriptions set pending_plan_id = 'same-price-other' where subscription_id = 'sub-pending';
  begin
    perform billing.bind_sumup_renewal_checkout_draft('pending-reference', 'pending-checkout', 'sub-pending', '2026-10-01Z', '2026-11-01Z');
    raise exception 'different same-price plan rebound';
  exception when others then
    if sqlerrm <> 'renewal_binding_conflict' then raise; end if;
  end;
  begin
    perform billing.commit_verified_sumup_renewal('pending-reference', 'sub-pending', '2026-10-01Z', 'pending-checkout', '2026-11-01Z');
    raise exception 'different same-price plan committed';
  exception when others then
    if sqlerrm <> 'renewal_commit_conflict' then raise; end if;
  end;
  update billing.subscriptions set pending_plan_id = 'pending-target' where subscription_id = 'sub-pending';

  begin
    update billing.sumup_renewal_attempts set expected_plan_id = 'same-price-other' where checkout_reference = 'pending-reference';
    raise exception 'plan snapshot changed';
  exception when others then
    if sqlerrm <> 'sumup_renewal_snapshot_immutable' then raise; end if;
  end;
  update billing.plans set version = 4 where plan_id = 'pending-target';
  begin
    perform billing.commit_verified_sumup_renewal('pending-reference', 'sub-pending', '2026-10-01Z', 'pending-checkout', '2026-11-01Z');
    raise exception 'changed plan version committed';
  exception when others then
    if sqlerrm <> 'renewal_commit_conflict' then raise; end if;
  end;
  update billing.plans set version = 2 where plan_id = 'pending-target';

  result := billing.commit_verified_sumup_renewal('pending-reference', 'sub-pending', '2026-10-01Z', 'pending-checkout', '2026-11-01Z');
  if result->>'committed' is distinct from 'true'
     or not exists (select 1 from billing.subscriptions where subscription_id = 'sub-pending'
       and plan_id = 'pending-target' and plan_version = 2 and pending_plan_id is null and pending_plan_change is null
       and current_period_end = '2026-11-01Z'::timestamptz and status = 'ACTIVE') then
    raise exception 'actual pending plan lifecycle not applied';
  end if;
  result := billing.commit_verified_sumup_renewal('pending-reference', 'sub-pending', '2026-10-01Z', 'pending-checkout', '2026-11-01Z');
  if result->>'already_committed' is distinct from 'true'
     or (select count(*) from billing.subscription_events where subscription_id = 'sub-pending' and operation = 'period.advance') <> 1 then
    raise exception 'pending settlement not idempotent';
  end if;
end;
$test$;
rollback;

-- Invalid targets cannot fall back to charging the current plan.
begin;
update billing.subscriptions set current_period_end = '2026-10-01Z', pending_plan_id = 'missing-target', pending_plan_change = 'next_period';
do $$ begin
  if exists (select 1 from billing.list_sumup_renewal_work_draft(20)) then raise exception 'missing pending target fell back to old price'; end if;
end $$;
insert into billing.plans values ('missing-target', 900, 'SEK', 2, false);
do $$ begin
  if exists (select 1 from billing.list_sumup_renewal_work_draft(20)) then raise exception 'inactive target selected'; end if;
end $$;
update billing.plans set active = true, currency = 'EUR' where plan_id = 'missing-target';
do $$ begin
  if exists (select 1 from billing.list_sumup_renewal_work_draft(20)) then raise exception 'wrong currency target selected'; end if;
end $$;
rollback;

-- Current-plan renewals still use the current price and actual lifecycle.
begin;
insert into billing.subscriptions
  (subscription_id, user_id, plan_id, provider, status, provider_customer_ref, plan_version, current_period_end)
values ('sub-current', 'current-user', 'plan-1', 'sumup', 'ACTIVE', 'current-customer', 1, '2026-10-01Z');
insert into billing.sumup_recurring_instruments
  (subscription_id, user_id, provider_customer_ref, status, instrument_fingerprint)
values ('sub-current', 'current-user', 'current-customer', 'verified', repeat('c',64));
do $$ begin
  perform billing.claim_sumup_renewal_attempt('current-reference', 'sub-current', '2026-10-01Z');
  perform billing.bind_sumup_renewal_checkout_draft('current-reference', 'current-checkout', 'sub-current', '2026-10-01Z', '2026-11-01Z');
  if not exists (select 1 from billing.sumup_renewal_attempts where checkout_reference = 'current-reference'
    and expected_plan_id = 'plan-1' and expected_plan_version = 1 and expected_amount_minor = 1900) then raise exception 'current price changed'; end if;
  perform billing.commit_verified_sumup_renewal('current-reference', 'sub-current', '2026-10-01Z', 'current-checkout', '2026-11-01Z');
end $$;
rollback;
