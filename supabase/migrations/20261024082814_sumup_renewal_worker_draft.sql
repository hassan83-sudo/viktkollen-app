-- DRAFT ONLY: no grants, no scheduler, no live database changes authorized here.
-- Read server-owned pricing and instruments; never accept client billing facts.
-- Pending plan changes are deliberately excluded until priced settlement supports them.
create or replace function billing.list_sumup_renewal_work_draft(p_limit integer)
returns table (
  subscription_id text, period_end timestamptz, customer_id text,
  amount_minor bigint, currency text, instrument_fingerprint text
)
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select s.subscription_id, s.current_period_end, i.provider_customer_ref,
         coalesce(a.expected_amount_minor, p.price_minor)::bigint,
         coalesce(a.expected_currency, p.currency), i.instrument_fingerprint
  from billing.subscriptions s
  join billing.plans p on p.plan_id = s.plan_id and p.version = s.plan_version
  join billing.sumup_recurring_instruments i
    on i.subscription_id = s.subscription_id and i.user_id = s.user_id
   and i.provider_customer_ref = s.provider_customer_ref and i.status = 'verified'
  left join billing.sumup_renewal_attempts a
    on a.subscription_id = s.subscription_id and a.period_end = s.current_period_end
  where s.provider = 'sumup' and s.status in ('ACTIVE', 'PAST_DUE')
    and not s.cancel_at_period_end and s.current_period_end <= pg_catalog.now()
    and p.active and p.currency = 'SEK' and p.price_minor > 0
    and nullif(pg_catalog.to_jsonb(s)->>'pending_plan_id', '') is null
    and (a.status is null or a.status in ('reserved', 'created', 'processing'))
  order by s.current_period_end, s.subscription_id
  limit least(greatest(p_limit, 0), 100)
$$;
revoke all on function billing.list_sumup_renewal_work_draft(integer)
  from public, anon, authenticated, service_role;
-- Dedicated worker role is provisioned only after isolated end-to-end review.
