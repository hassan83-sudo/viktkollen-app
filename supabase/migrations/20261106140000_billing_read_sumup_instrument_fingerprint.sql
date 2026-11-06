-- Read one stored SumUp instrument fingerprint for a later renewal match.
-- Prepared locally. Do not apply to Production until this migration is approved.
-- Does not create a table, change a subscription, grant access, or return a
-- payment instrument secret or card data.

create or replace function billing.read_sumup_instrument_fingerprint(
  p_subscription_id text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  stored_fingerprint text;
begin
  if p_subscription_id is null
     or p_subscription_id !~ '^[A-Za-z0-9._:-]{1,80}$' then
    return null;
  end if;

  select i.instrument_fingerprint
    into stored_fingerprint
  from billing.sumup_recurring_instruments i
  where i.subscription_id = p_subscription_id
    and i.status = 'verified';

  if stored_fingerprint is null
     or stored_fingerprint !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  return stored_fingerprint;
end;
$$;

revoke all on function billing.read_sumup_instrument_fingerprint(text) from public, anon, authenticated, service_role;
grant execute on function billing.read_sumup_instrument_fingerprint(text) to service_role;
