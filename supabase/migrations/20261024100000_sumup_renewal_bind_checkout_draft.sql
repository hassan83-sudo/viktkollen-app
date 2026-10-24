-- DRAFT ONLY. Do not apply to Staging or Production until the full worker is reviewed.
-- Binds a provider checkout and immutable expected billing facts before any charge attempt.
-- This function never contacts SumUp and never advances a subscription.
create or replace function billing.bind_sumup_renewal_checkout_draft(
  p_checkout_reference text,
  p_provider_checkout_ref text,
  p_subscription_id text,
  p_period_end timestamptz,
  p_expected_next_period_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  attempt billing.sumup_renewal_attempts;
  subscription billing.subscriptions;
  instrument billing.sumup_recurring_instruments;
  plan billing.plans;
begin
  if p_checkout_reference is null or p_checkout_reference !~ '^[A-Za-z0-9._:-]{1,64}$'
     or p_provider_checkout_ref is null or p_provider_checkout_ref !~ '^[A-Za-z0-9._:-]{1,80}$'
     or p_subscription_id is null or p_period_end is null
     or p_expected_next_period_end is null
     or p_expected_next_period_end <= p_period_end then
    raise exception 'invalid_renewal_binding';
  end if;

  select * into subscription
  from billing.subscriptions s
  where s.subscription_id = p_subscription_id
  for update;

  if not found or subscription.provider is distinct from 'sumup'
     or subscription.status not in ('ACTIVE', 'PAST_DUE')
     or subscription.cancel_at_period_end
     or subscription.current_period_end is distinct from p_period_end
     or subscription.current_period_end > pg_catalog.now() then
    raise exception 'renewal_not_eligible';
  end if;

  select * into instrument
  from billing.sumup_recurring_instruments i
  where i.subscription_id = p_subscription_id
    and i.user_id = subscription.user_id
    and i.status = 'verified'
  for share;

  if not found or instrument.provider_customer_ref is null then
    raise exception 'renewal_instrument_missing';
  end if;

  select * into plan
  from billing.plans p
  where p.plan_id = subscription.plan_id
    and p.version = subscription.plan_version
    and p.active = true
    and p.currency = 'SEK'
    and p.price_minor > 0;

  if not found then
    raise exception 'renewal_plan_invalid';
  end if;

  select * into attempt
  from billing.sumup_renewal_attempts a
  where a.subscription_id = p_subscription_id
    and a.period_end = p_period_end
  for update;

  if not found or attempt.checkout_reference is distinct from p_checkout_reference
     or attempt.status not in ('processing', 'reserved')
     or (attempt.provider_checkout_ref <> '' and attempt.provider_checkout_ref is distinct from p_provider_checkout_ref)
     or (attempt.expected_customer_ref is not null and attempt.expected_customer_ref is distinct from instrument.provider_customer_ref)
     or (attempt.expected_amount_minor is not null and attempt.expected_amount_minor is distinct from plan.price_minor)
     or (attempt.expected_currency is not null and attempt.expected_currency is distinct from plan.currency)
     or (attempt.expected_next_period_end is not null and attempt.expected_next_period_end is distinct from p_expected_next_period_end) then
    raise exception 'renewal_binding_conflict';
  end if;

  if exists (
    select 1 from billing.sumup_renewal_attempts a
    where a.provider_checkout_ref = p_provider_checkout_ref
      and a.checkout_reference <> p_checkout_reference
  ) then
    raise exception 'renewal_checkout_already_bound';
  end if;

  update billing.sumup_renewal_attempts
  set provider_checkout_ref = p_provider_checkout_ref,
      expected_customer_ref = instrument.provider_customer_ref,
      expected_amount_minor = plan.price_minor,
      expected_currency = plan.currency,
      expected_next_period_end = p_expected_next_period_end,
      status = 'processing',
      updated_at = pg_catalog.now()
  where checkout_reference = p_checkout_reference;

  return pg_catalog.jsonb_build_object('bound', true);
end;
$$;

revoke all on function billing.bind_sumup_renewal_checkout_draft(text, text, text, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
-- No EXECUTE grant. Grant only to a dedicated, audited worker role after end-to-end tests.
