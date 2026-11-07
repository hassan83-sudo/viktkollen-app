-- Tell the inserting server instance that it owns the renewal reservation.
-- A second instance gets inserted false and must not create another charge.
-- Prepared locally. Do not apply to Production until this migration is approved.
-- Does not store a payment instrument token or card data.

create or replace function billing.reserve_sumup_renewal_attempt(
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
  stored billing.sumup_renewal_attempts;
  inserted_count integer;
begin
  insert into billing.sumup_renewal_attempts (
    checkout_reference,
    period_end,
    subscription_id
  ) values (
    p_checkout_reference,
    p_period_end,
    p_subscription_id
  )
  on conflict (checkout_reference) do nothing;
  get diagnostics inserted_count = row_count;

  select * into stored
  from billing.sumup_renewal_attempts
  where checkout_reference = p_checkout_reference;

  if stored.subscription_id is distinct from p_subscription_id
     or stored.period_end is distinct from p_period_end then
    raise exception 'renewal_attempt_conflict';
  end if;

  return pg_catalog.jsonb_build_object(
    'checkout_reference', stored.checkout_reference,
    'inserted', inserted_count = 1,
    'status', stored.status
  );
exception
  when unique_violation then
    raise exception 'renewal_attempt_conflict';
end;
$$;

revoke all on function billing.reserve_sumup_renewal_attempt(text, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function billing.reserve_sumup_renewal_attempt(text, text, timestamptz) to service_role;
