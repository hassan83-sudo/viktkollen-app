-- Draft only. NOT APPROVED FOR STAGING OR PRODUCTION.
-- A claim is an exclusive one-time permission to attempt a renewal.
-- A lost worker must be reconciled with SumUp; do not re-claim automatically.
create or replace function billing.claim_sumup_renewal_attempt(
  p_checkout_reference text,
  p_subscription_id text,
  p_period_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  attempt billing.sumup_renewal_attempts;
  subscription billing.subscriptions;
begin
  if p_checkout_reference is null or p_checkout_reference !~ '^[A-Za-z0-9._:-]{1,64}$'
     or p_subscription_id is null or p_period_end is null then
    raise exception 'invalid_renewal_claim';
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

  if not exists (
    select 1 from billing.sumup_recurring_instruments i
    where i.subscription_id = p_subscription_id
      and i.user_id = subscription.user_id
      and i.status = 'verified'
  ) then
    raise exception 'renewal_instrument_missing';
  end if;

  insert into billing.sumup_renewal_attempts
    (checkout_reference, subscription_id, period_end, status)
  values (p_checkout_reference, p_subscription_id, p_period_end, 'processing')
  on conflict (subscription_id, period_end) do nothing
  returning * into attempt;

  if found then
    return pg_catalog.jsonb_build_object(
      'claimed', true,
      'checkout_reference', attempt.checkout_reference,
      'status', attempt.status
    );
  end if;

  select * into attempt from billing.sumup_renewal_attempts a
  where a.subscription_id = p_subscription_id and a.period_end = p_period_end;

  return pg_catalog.jsonb_build_object(
    'claimed', false,
    'checkout_reference', attempt.checkout_reference,
    'status', attempt.status
  );
end;
$$;

revoke all on function billing.claim_sumup_renewal_attempt(text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function billing.claim_sumup_renewal_attempt(text, text, timestamptz)
  to service_role;
