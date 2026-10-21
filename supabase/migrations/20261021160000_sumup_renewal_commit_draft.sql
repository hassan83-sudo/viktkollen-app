-- DRAFT ONLY. DO NOT APPLY TO STAGING OR PRODUCTION.
-- PAID cannot be attested by SQL alone; this RPC stays inaccessible until
-- a privileged verification boundary and restricted execution role exist.
-- A successful RPC atomically advances the period and finalizes its attempt.
create or replace function billing.commit_verified_sumup_renewal(
  p_checkout_reference text,
  p_subscription_id text,
  p_period_end timestamptz,
  p_provider_checkout_ref text,
  p_next_period_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  attempt billing.sumup_renewal_attempts;
  subscription billing.subscriptions;
  updated billing.subscriptions;
begin
  if p_checkout_reference is null or p_checkout_reference !~ '^[A-Za-z0-9._:-]{1,64}$'
     or p_provider_checkout_ref is null or p_provider_checkout_ref !~ '^[A-Za-z0-9._:-]{1,80}$'
     or p_subscription_id is null or p_period_end is null or p_next_period_end is null
     or p_next_period_end <= p_period_end then
    raise exception 'invalid_renewal_commit';
  end if;

  select * into subscription from billing.subscriptions s
  where s.subscription_id = p_subscription_id for update;
  if not found or subscription.provider is distinct from 'sumup' then
    raise exception 'renewal_subscription_invalid';
  end if;

  select * into attempt from billing.sumup_renewal_attempts a
  where a.subscription_id = p_subscription_id and a.period_end = p_period_end
  for update;
  if not found or attempt.checkout_reference is distinct from p_checkout_reference then
    raise exception 'renewal_attempt_conflict';
  end if;

  if attempt.status = 'succeeded' then
    if attempt.provider_checkout_ref is distinct from p_provider_checkout_ref
       or attempt.expected_next_period_end is distinct from p_next_period_end
       or subscription.current_period_end < p_next_period_end then
      raise exception 'renewal_commit_conflict';
    end if;
    return pg_catalog.jsonb_build_object('committed', false, 'already_committed', true);
  end if;

  if attempt.status <> 'processing'
     or attempt.provider_checkout_ref is distinct from p_provider_checkout_ref
     or attempt.provider_checkout_ref = ''
     or attempt.expected_next_period_end is distinct from p_next_period_end
     or attempt.expected_customer_ref is null
     or attempt.expected_amount_minor is null
     or attempt.expected_amount_minor <= 0
     or attempt.expected_currency is distinct from 'SEK'
     or subscription.current_period_end is distinct from p_period_end
     or subscription.status not in ('ACTIVE', 'PAST_DUE')
     or not exists (
       select 1 from billing.sumup_recurring_instruments i
       where i.subscription_id = subscription.subscription_id
         and i.user_id = subscription.user_id
         and i.provider_customer_ref = attempt.expected_customer_ref
         and i.status = 'verified'
     ) then
    raise exception 'renewal_commit_conflict';
  end if;

  updated := billing.advance_subscription_period(
    p_subscription_id, p_next_period_end, 'sumup_' || p_checkout_reference
  );
  if updated.current_period_end is distinct from p_next_period_end then
    raise exception 'renewal_period_not_advanced';
  end if;

  update billing.sumup_renewal_attempts
  set status = 'succeeded',
      provider_checkout_ref = p_provider_checkout_ref,
      updated_at = pg_catalog.now()
  where checkout_reference = p_checkout_reference;

  return pg_catalog.jsonb_build_object('committed', true, 'already_committed', false);
end;
$$;

revoke all on function billing.commit_verified_sumup_renewal(text, text, timestamptz, text, timestamptz)
  from public, anon, authenticated, service_role;
-- Intentionally NO execute grant. Never expose this commit RPC via service_role.
-- Verification must be enforced at the privileged boundary before enabling it.
