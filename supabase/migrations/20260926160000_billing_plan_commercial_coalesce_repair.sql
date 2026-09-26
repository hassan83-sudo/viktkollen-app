-- BILL-8B repair for already-installed commercial-control functions.
-- Local migration only. DO NOT apply to staging. DO NOT apply to production.
-- Replaces only functions whose bodies contained invalid schema-qualified coalesce calls.
-- Does not replace billing.set_plan_commercial_availability. That function calls
-- billing.list_plan_commercial_controls and does not contain the invalid expression.
-- Does not insert, update, or delete commercial-control rows.
-- CREATE OR REPLACE keeps the existing function privileges. No new grants.

create or replace function billing.list_plan_commercial_controls(p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_actor_user_id is null or not billing.has_billing_admin(p_actor_user_id) then
    raise exception 'forbidden_admin';
  end if;
  return (
    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'display_order', coalesce(stored.display_order, catalog.display_order),
        'enabled_for_sale', coalesce(stored.enabled_for_sale, false),
        'featured', false,
        'plan_id', catalog.plan_id,
        'version', coalesce(stored.version, 0)
      )
      order by coalesce(stored.display_order, catalog.display_order)
    ), '[]'::jsonb)
    from billing.paid_candidate_plans() catalog
    left join billing.plan_commercial_controls stored on stored.plan_id = catalog.plan_id
  );
end;
$$;

create or replace function billing.move_plan_commercial_order(
  p_actor_user_id uuid,
  p_plan_id text,
  p_direction text,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  current_order integer;
  current_enabled boolean;
  current_version integer;
  neighbor_id text;
  neighbor_order integer;
  neighbor_enabled boolean;
  neighbor_version integer;
begin
  if p_actor_user_id is null or not billing.has_billing_admin(p_actor_user_id) then
    raise exception 'forbidden_admin';
  end if;
  if p_plan_id = 'plan.free' then
    raise exception 'protected_plan';
  end if;
  if p_direction not in ('up', 'down') or p_expected_version is null or p_expected_version < 0 then
    raise exception 'invalid_plan_control';
  end if;
  if not exists (select 1 from billing.paid_candidate_plans() catalog where catalog.plan_id = p_plan_id) then
    raise exception 'unknown_plan';
  end if;
  select
    coalesce(stored.display_order, catalog.display_order),
    coalesce(stored.enabled_for_sale, false),
    coalesce(stored.version, 0)
  into current_order, current_enabled, current_version
  from billing.paid_candidate_plans() catalog
  left join billing.plan_commercial_controls stored on stored.plan_id = catalog.plan_id
  where catalog.plan_id = p_plan_id;
  if current_version is distinct from p_expected_version then
    raise exception 'CONFIG_CONFLICT';
  end if;
  select
    ranked.plan_id,
    ranked.display_order,
    ranked.enabled_for_sale,
    ranked.version
  into neighbor_id, neighbor_order, neighbor_enabled, neighbor_version
  from (
    select
      catalog.plan_id,
      coalesce(stored.display_order, catalog.display_order) as display_order,
      coalesce(stored.enabled_for_sale, false) as enabled_for_sale,
      coalesce(stored.version, 0) as version
    from billing.paid_candidate_plans() catalog
    left join billing.plan_commercial_controls stored on stored.plan_id = catalog.plan_id
  ) ranked
  where ranked.plan_id is distinct from p_plan_id
    and (
      (p_direction = 'up' and ranked.display_order < current_order)
      or (p_direction = 'down' and ranked.display_order > current_order)
    )
  order by
    case when p_direction = 'up' then ranked.display_order end desc,
    case when p_direction = 'down' then ranked.display_order end asc
  limit 1;
  if neighbor_id is null then
    raise exception 'order_bound';
  end if;
  insert into billing.plan_commercial_controls (
    display_order,
    enabled_for_sale,
    featured,
    plan_id,
    updated_by,
    version
  ) values
    (neighbor_order, current_enabled, false, p_plan_id, p_actor_user_id, current_version + 1),
    (current_order, neighbor_enabled, false, neighbor_id, p_actor_user_id, neighbor_version + 1)
  on conflict (plan_id) do update set
    display_order = excluded.display_order,
    enabled_for_sale = billing.plan_commercial_controls.enabled_for_sale,
    featured = false,
    updated_at = pg_catalog.now(),
    updated_by = excluded.updated_by,
    version = excluded.version;
  perform billing.append_admin_audit(
    p_actor_user_id,
    'plan.commercial.changed',
    'plan_commercial',
    p_plan_id,
    'MANUAL_ADMIN',
    pg_catalog.jsonb_build_object(
      'display_order', current_order,
      'enabled_for_sale', current_enabled,
      'field', 'display_order',
      'plan_id', p_plan_id,
      'version', case when current_version = 0 then null else current_version end
    ),
    pg_catalog.jsonb_build_object(
      'display_order', neighbor_order,
      'enabled_for_sale', current_enabled,
      'field', 'display_order',
      'plan_id', p_plan_id,
      'version', current_version + 1
    )
  );
  return billing.list_plan_commercial_controls(p_actor_user_id);
end;
$$;
