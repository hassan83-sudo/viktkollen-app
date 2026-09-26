-- BILL-7X3 narrow sale-flag read.
-- Local migration only. DO NOT apply to staging. DO NOT apply to production.
-- Does not insert, update, or delete commercial-control rows.
-- Missing rows stay not for sale.

create or replace function billing.plan_enabled_for_sale(p_plan_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce((
    select stored.enabled_for_sale
    from billing.plan_commercial_controls stored
    where stored.plan_id = p_plan_id
  ), false);
$$;

revoke all on function billing.plan_enabled_for_sale(text) from public, anon, authenticated, service_role;
grant execute on function billing.plan_enabled_for_sale(text) to service_role;
