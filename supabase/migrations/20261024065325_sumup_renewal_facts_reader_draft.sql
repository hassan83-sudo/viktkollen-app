-- DRAFT ONLY. DO NOT APPLY TO STAGING OR PRODUCTION.
-- Read trusted renewal facts only after the checkout ID and expected price
-- have been bound in a separate reviewed transaction before charging.
create or replace function billing.read_sumup_renewal_facts_draft(
  p_subscription_id text,
  p_period_end timestamptz
)
returns table (
  subscription_id text,
  period_end timestamptz,
  provider text,
  status text,
  checkout_reference text,
  provider_checkout_ref text,
  next_period_end timestamptz,
  customer_id text,
  amount_minor bigint,
  currency text
)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select
    s.subscription_id,
    a.period_end,
    s.provider,
    s.status,
    a.checkout_reference,
    a.provider_checkout_ref,
    a.expected_next_period_end,
    a.expected_customer_ref,
    a.expected_amount_minor,
    a.expected_currency
  from billing.sumup_renewal_attempts a
  join billing.subscriptions s
    on s.subscription_id = a.subscription_id
  join billing.sumup_recurring_instruments i
    on i.subscription_id = s.subscription_id
   and i.user_id = s.user_id
   and i.status = 'verified'
   and i.provider_customer_ref = a.expected_customer_ref
  where a.subscription_id = p_subscription_id
    and a.period_end = p_period_end
    and a.status = 'processing'
    and a.provider_checkout_ref <> ''
    and a.expected_amount_minor > 0
    and a.expected_currency = 'SEK'
    and a.expected_next_period_end > a.period_end
    and s.provider = 'sumup'
    and s.status in ('ACTIVE', 'PAST_DUE')
    and s.current_period_end = a.period_end
    and not s.cancel_at_period_end
$$;

revoke all on function billing.read_sumup_renewal_facts_draft(text, timestamptz)
  from public, anon, authenticated, service_role;
-- NO EXECUTE GRANT: requires audited server-only reader role.
