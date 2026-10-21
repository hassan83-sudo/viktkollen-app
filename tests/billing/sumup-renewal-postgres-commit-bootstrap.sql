-- Disposable PostgreSQL test only: stub for the separately tested period-advance RPC.
-- This is NOT the production implementation of advance_subscription_period.
alter table billing.sumup_renewal_attempts
  add column updated_at timestamptz not null default now();

create function billing.advance_subscription_period(
  p_subscription_id text, p_next_period_end timestamptz, p_idempotency_key text
)
returns billing.subscriptions
language plpgsql
as $$
declare result billing.subscriptions;
begin
  update billing.subscriptions
     set current_period_end = p_next_period_end
   where subscription_id = p_subscription_id
   returning * into result;
  return result;
end;
$$;
