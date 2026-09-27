-- BILL-11H read-only checkout intent lookup for SumUp webhook verification.
-- Local migration only. DO NOT apply to staging. DO NOT apply to production.
-- This function does not create a subscription, bind an instrument, or grant access.
-- It returns only the durable checkout intent identity used before activation.

create or replace function billing.read_sumup_checkout_intent(p_checkout_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing billing.checkout_intents;
begin
  if p_checkout_id is null
     or p_checkout_id !~ '^[A-Za-z0-9._:-]{1,80}$' then
    return null;
  end if;

  select * into existing
  from billing.checkout_intents
  where checkout_id = p_checkout_id
    and provider = 'sumup';

  if existing.checkout_id is null then
    return null;
  end if;

  return pg_catalog.jsonb_build_object(
    'checkout_id', existing.checkout_id,
    'expires_at', existing.expires_at,
    'plan_id', existing.plan_id,
    'provider', existing.provider,
    'provider_checkout_ref', existing.provider_checkout_ref,
    'status', existing.status,
    'user_id', existing.user_id
  );
end;
$$;

revoke all on function billing.read_sumup_checkout_intent(text) from public, anon, authenticated, service_role;
grant execute on function billing.read_sumup_checkout_intent(text) to service_role;
