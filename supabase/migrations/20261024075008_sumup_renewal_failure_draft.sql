-- DRAFT ONLY: requires a server verifier and a separately restricted execution role.
-- No grants. Does not authorize any deployment, charging or live migration.
create or replace function billing.record_verified_sumup_renewal_failure_draft(
  p_checkout_reference text, p_subscription_id text,
  p_period_end timestamptz, p_provider_checkout_ref text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  subscription billing.subscriptions;
  attempt billing.sumup_renewal_attempts;
  updated billing.subscriptions;
begin
  if p_checkout_reference is null or p_checkout_reference !~ '^[A-Za-z0-9._:-]{1,64}$'
     or p_subscription_id is null or p_period_end is null
     or p_provider_checkout_ref is null or p_provider_checkout_ref !~ '^[A-Za-z0-9._:-]{1,80}$' then
    raise exception 'invalid_renewal_failure';
  end if;
  -- Match the lock order used by claim, binding and successful settlement.
  select * into subscription from billing.subscriptions s
  where s.subscription_id = p_subscription_id for update;
  if not found or subscription.provider is distinct from 'sumup' then
    raise exception 'renewal_failure_conflict';
  end if;
  select * into attempt from billing.sumup_renewal_attempts a
  where a.subscription_id = p_subscription_id and a.period_end = p_period_end for update;
  if not found or attempt.checkout_reference is distinct from p_checkout_reference
     or attempt.provider_checkout_ref is distinct from p_provider_checkout_ref
     or attempt.provider_checkout_ref = '' then
    raise exception 'renewal_failure_conflict';
  end if;
  if attempt.status = 'failed' then
    return pg_catalog.jsonb_build_object('recorded', false, 'already_recorded', true);
  end if;
  if attempt.status <> 'processing'
     or subscription.status not in ('ACTIVE', 'PAST_DUE')
     or subscription.cancel_at_period_end
     or subscription.current_period_end is distinct from p_period_end
     or attempt.expected_currency is distinct from 'SEK'
     or attempt.expected_amount_minor is null or attempt.expected_amount_minor <= 0
     or attempt.expected_customer_ref is null
     or not exists (
       select 1 from billing.sumup_recurring_instruments i
       where i.subscription_id = p_subscription_id and i.user_id = subscription.user_id
         and i.provider_customer_ref = attempt.expected_customer_ref and i.status = 'verified'
     ) then
    raise exception 'renewal_failure_conflict';
  end if;
  -- Same seven-day grace as the existing recurring lifecycle. Derive it from
  -- the original period, never from invocation time (retries cannot extend it).
  updated := billing.mark_renewal_failed(
    p_subscription_id, 'sumup_fail_' || p_checkout_reference,
    p_period_end + interval '168 hours', p_period_end
  );
  if updated.status is distinct from 'PAST_DUE'
     or updated.current_period_end is distinct from p_period_end then
    raise exception 'renewal_failure_not_applied';
  end if;
  update billing.sumup_renewal_attempts
  set status = 'failed', updated_at = pg_catalog.now()
  where checkout_reference = p_checkout_reference;
  return pg_catalog.jsonb_build_object('recorded', true, 'already_recorded', false);
end;
$$;
revoke all on function billing.record_verified_sumup_renewal_failure_draft(text, text, timestamptz, text)
  from public, anon, authenticated, service_role;
-- No EXECUTE grant: verified failure boundary is mandatory before enabling.
