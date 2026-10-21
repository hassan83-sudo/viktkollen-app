-- DRAFT ONLY. DO NOT APPLY TO STAGING OR PRODUCTION.
-- Caller MUST independently retrieve and verify PAID status from SumUp.
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
       or subscription.current_period_end < p_next_period_end then
      raise exception 'renewal_commit_conflict';
    end if;
    return pg_catalog.jsonb_build_object('committed', false, 'already_committed', true);
  end if;

  if attempt.status <> 'processing'
     or (attempt.provider_checkout_ref <> ''
         and attempt.provider_checkout_ref is distinct from p_provider_checkout_ref)
     or subscription.current_period_end is distinct from p_period_end
     or subscription.status not in ('ACTIVE', 'PAST_DUE') then
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
grant execute on function billing.commit_verified_sumup_renewal(text, text, timestamptz, text, timestamptz)
  to service_role;
