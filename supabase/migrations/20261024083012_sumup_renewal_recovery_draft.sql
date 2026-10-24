-- DRAFT ONLY. CLI-generated migration ordered after pending-plan snapshots.
-- Durable provider observations; never reclaims a claim or charges/refunds cards.
alter table billing.sumup_renewal_attempts
  add column if not exists observed_outcome text,
  add column if not exists observed_transaction_id text,
  add column if not exists recovery_state text,
  add column if not exists recovery_reason text,
  add column if not exists last_reconciled_at timestamptz;
create unique index if not exists sumup_observed_paid_transaction_unique
  on billing.sumup_renewal_attempts(observed_transaction_id)
  where observed_transaction_id is not null;

create or replace function billing.list_sumup_renewal_recovery_draft(p_limit integer)
returns table (
  subscription_id text, period_end timestamptz, checkout_reference text,
  provider_checkout_ref text, next_period_end timestamptz, customer_id text,
  amount_minor bigint, currency text
)
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select a.subscription_id, a.period_end, a.checkout_reference,
    a.provider_checkout_ref, a.expected_next_period_end, a.expected_customer_ref,
    a.expected_amount_minor, a.expected_currency
  from billing.sumup_renewal_attempts a
  where a.status in ('processing','reserved','created')
  -- Independent of current subscription eligibility and catalog state.
  order by a.last_reconciled_at nulls first, a.created_at, a.checkout_reference
  limit least(greatest(p_limit,0),100)
$$;
revoke all on function billing.list_sumup_renewal_recovery_draft(integer)
  from public, anon, authenticated, service_role;

create or replace function billing.record_sumup_renewal_observation_draft(
  p_checkout_reference text, p_provider_checkout_ref text,
  p_outcome text, p_transaction_id text, p_force_review boolean
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  attempt billing.sumup_renewal_attempts;
  subscription billing.subscriptions;
  target_plan text;
  reason text;
  state text;
begin
  if p_checkout_reference is null or p_outcome is null or p_force_review is null
     or p_outcome not in ('paid','failed','pending','unknown') then
    raise exception 'invalid_renewal_observation';
  end if;
  -- The subscription may have changed; preserve evidence instead of dropping it.
  select s.* into subscription from billing.subscriptions s
  join billing.sumup_renewal_attempts a on a.subscription_id = s.subscription_id
  where a.checkout_reference = p_checkout_reference for update of s;
  select * into attempt from billing.sumup_renewal_attempts a
  where a.checkout_reference = p_checkout_reference for update;
  if not found or attempt.provider_checkout_ref is distinct from p_provider_checkout_ref then
    raise exception 'renewal_observation_conflict';
  end if;
  if p_outcome <> 'unknown' and (attempt.provider_checkout_ref = ''
     or attempt.expected_customer_ref is null or attempt.expected_amount_minor is null
     or attempt.expected_amount_minor <= 0 or attempt.expected_currency is distinct from 'SEK') then
    raise exception 'renewal_observation_unbound';
  end if;
  if p_outcome = 'paid' and (p_transaction_id is null
    or p_transaction_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
     or p_outcome <> 'paid' and p_transaction_id is not null then
    raise exception 'invalid_renewal_transaction';
  end if;
  if attempt.observed_outcome = 'paid' and p_outcome not in ('paid','unknown')
     or attempt.observed_transaction_id is not null and p_outcome = 'paid'
       and attempt.observed_transaction_id is distinct from lower(p_transaction_id)
     or attempt.status = 'succeeded' and p_outcome not in ('paid','unknown')
     or attempt.status = 'failed' and p_outcome not in ('failed','unknown') then
    raise exception 'renewal_observation_conflict';
  end if;
  target_plan := case when subscription.pending_plan_change = 'next_period'
    then subscription.pending_plan_id else subscription.plan_id end;
  if attempt.status in ('succeeded','failed') then
    state := 'settled';
  else
    if attempt.expected_plan_id is null or attempt.expected_plan_version is null
       or attempt.expected_next_period_end is null or attempt.provider_checkout_ref = '' then
      reason := 'missing_snapshot';
    elsif subscription.subscription_id is null or subscription.provider is distinct from 'sumup'
       or subscription.status not in ('ACTIVE','PAST_DUE')
       or subscription.cancel_at_period_end
       or subscription.current_period_end is distinct from attempt.period_end
       or target_plan is distinct from attempt.expected_plan_id
       or not exists (select 1 from billing.plans p where p.plan_id = attempt.expected_plan_id
         and p.active and p.version = attempt.expected_plan_version
         and p.price_minor = attempt.expected_amount_minor and p.currency = attempt.expected_currency)
       or not exists (select 1 from billing.sumup_recurring_instruments i
         where i.subscription_id = subscription.subscription_id and i.user_id = subscription.user_id
           and i.status = 'verified' and i.provider_customer_ref = attempt.expected_customer_ref) then
      reason := 'lifecycle_changed';
    elsif p_force_review or p_outcome = 'unknown' then
      reason := 'verification_or_settlement_unavailable';
    end if;
    state := case when reason is not null then 'review_required'
      when p_outcome = 'pending' then 'pending' else 'ready_to_settle' end;
  end if;
  update billing.sumup_renewal_attempts
  set observed_outcome = case when p_outcome = 'unknown' and observed_outcome is not null
        then observed_outcome else p_outcome end,
      observed_transaction_id = coalesce(observed_transaction_id, lower(p_transaction_id)),
      recovery_state = state, recovery_reason = reason,
      last_reconciled_at = pg_catalog.now()
  where checkout_reference = p_checkout_reference;
  return pg_catalog.jsonb_build_object('state', state, 'reason', reason);
end;
$$;
revoke all on function billing.record_sumup_renewal_observation_draft(text,text,text,text,boolean)
  from public, anon, authenticated, service_role;
-- No EXECUTE grants. Observations require the isolated server-side verifier.
