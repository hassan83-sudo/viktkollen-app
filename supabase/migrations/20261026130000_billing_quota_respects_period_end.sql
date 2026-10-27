-- Prepared for Staging only. Do not apply to Production.
-- A paid assignment grants quota only while a subscription period is still open.
-- This does not update subscriptions or plan assignments.

create or replace function billing.open_paid_plan_id(p_user_id uuid, p_assigned_plan_id text)
returns text
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select case
    when p_assigned_plan_id is null or p_assigned_plan_id = 'plan.free' then coalesce(p_assigned_plan_id, 'plan.free')
    when exists (
      select 1
      from billing.subscriptions s
      where s.user_id = p_user_id
        and s.plan_id = p_assigned_plan_id
        and s.status in ('TRIALING', 'ACTIVE', 'PAST_DUE')
        and s.current_period_end > pg_catalog.now()
    ) then p_assigned_plan_id
    else 'plan.free'
  end;
$$;

revoke all on function billing.open_paid_plan_id(uuid, text) from public, anon, authenticated, service_role;
grant execute on function billing.open_paid_plan_id(uuid, text) to service_role;

create or replace function billing.reserve_quota(
  p_user_id uuid,
  p_feature text,
  p_unit text,
  p_quantity integer,
  p_reservation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_plan billing.plans%rowtype;
  v_assignment billing.user_plan_assignments%rowtype;
  v_entitlement billing.plan_entitlements%rowtype;
  v_period record;
  v_used record;
  v_existing billing.quota_reservations%rowtype;
  v_remaining integer;
  v_limit integer;
begin
  if p_user_id is null then
    return jsonb_build_object('status', 'DENIED_NO_USER');
  end if;
  if p_feature is null or p_feature not in (
    'ai.ear.interpret', 'ai.eye.analysis', 'ai.text.request', 'ai.voice.session',
    'body.scan', 'food.scan', 'gps.live.session', 'tts.request',
    'friend_chat', 'gps_standard', 'ready_avatar', 'smart_ai'
  ) then
    return jsonb_build_object('status', 'DENIED_UNKNOWN_FEATURE');
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 1000000000 then
    return jsonb_build_object('status', 'DENIED_INVALID_QUANTITY');
  end if;
  if p_reservation_id is null or char_length(p_reservation_id) < 1 then
    return jsonb_build_object('status', 'DENIED_INVALID_QUANTITY');
  end if;

  select * into v_existing
  from billing.quota_reservations
  where reservation_id = p_reservation_id;
  if found then
    if v_existing.user_id is distinct from p_user_id
      or v_existing.feature is distinct from p_feature
      or v_existing.quantity is distinct from p_quantity
      or v_existing.unit is distinct from coalesce(p_unit, v_existing.unit)
    then
      return jsonb_build_object('status', 'DENIED_INVALID_QUANTITY', 'reservation_id', v_existing.reservation_id);
    end if;
    return jsonb_build_object(
      'status', case v_existing.status
        when 'PENDING' then 'RESERVED'
        when 'COMMITTED' then 'COMMITTED'
        else v_existing.status
      end,
      'reservation_id', v_existing.reservation_id,
      'unit', v_existing.unit,
      'period_start', v_existing.period_start,
      'period_end', v_existing.period_end
    );
  end if;

  select * into v_assignment
  from billing.user_plan_assignments
  where user_id = p_user_id;
  if not found then
    select * into v_plan from billing.plans where plan_id = 'plan.free' and active;
    if not found then
      return jsonb_build_object('status', 'DENIED_UNKNOWN_PLAN');
    end if;
  else
    select * into v_plan from billing.plans where plan_id = v_assignment.plan_id and active;
    if not found then
      return jsonb_build_object('status', 'DENIED_UNKNOWN_PLAN');
    end if;
  end if;

  if v_plan.plan_id is distinct from 'plan.free'
     and billing.open_paid_plan_id(p_user_id, v_plan.plan_id) = 'plan.free' then
    select * into v_plan from billing.plans where plan_id = 'plan.free' and active;
    if not found then
      return jsonb_build_object('status', 'DENIED_UNKNOWN_PLAN');
    end if;
  end if;

  select * into v_period from billing.period_bounds(v_plan.billing_interval, v_now);
  perform billing.lock_quota_period(p_user_id, p_feature, v_period.period_start);

  select * into v_entitlement
  from billing.plan_entitlements
  where plan_id = v_plan.plan_id and feature = p_feature;
  if not found then
    return jsonb_build_object('status', 'DENIED_UNKNOWN_FEATURE');
  end if;
  if v_entitlement.enabled is not true then
    return jsonb_build_object('status', 'DENIED_DISABLED', 'unit', v_entitlement.unit,
      'period_start', v_period.period_start, 'period_end', v_period.period_end);
  end if;
  if coalesce(p_unit, v_entitlement.unit) is distinct from v_entitlement.unit then
    return jsonb_build_object('status', 'DENIED_UNIT_MISMATCH', 'unit', v_entitlement.unit,
      'period_start', v_period.period_start, 'period_end', v_period.period_end);
  end if;

  if p_feature in ('friend_chat', 'gps_standard', 'ready_avatar', 'smart_ai') then
    return jsonb_build_object(
      'status', 'ALLOWED_UNMETERED',
      'limit', 'UNLIMITED',
      'unit', v_entitlement.unit,
      'period_start', v_period.period_start,
      'period_end', v_period.period_end
    );
  end if;

  if p_quantity = 0 then
    return jsonb_build_object(
      'status', 'ALLOWED',
      'unit', v_entitlement.unit,
      'period_start', v_period.period_start,
      'period_end', v_period.period_end,
      'reservation_id', null
    );
  end if;

  if v_entitlement.limit_kind = 'UNLIMITED' then
    return jsonb_build_object(
      'status', 'UNLIMITED',
      'limit', 'UNLIMITED',
      'unit', v_entitlement.unit,
      'period_start', v_period.period_start,
      'period_end', v_period.period_end
    );
  end if;

  select * into v_used from billing.quota_period_used(
    p_user_id, p_feature, v_entitlement.unit, v_period.period_start, v_now
  );
  v_limit := v_entitlement.limit_value;
  v_remaining := greatest(0, v_limit - v_used.committed - v_used.reserved);
  if v_remaining < p_quantity then
    return jsonb_build_object(
      'status', 'DENIED_QUOTA_EXCEEDED',
      'limit', v_limit,
      'used', v_used.committed,
      'reserved', v_used.reserved,
      'remaining', v_remaining,
      'unit', v_entitlement.unit,
      'period_start', v_period.period_start,
      'period_end', v_period.period_end
    );
  end if;

  insert into billing.quota_reservations (
    reservation_id, user_id, feature, quantity, actual_quantity, overage_quantity,
    unit, status, plan_id, plan_version, period_start, period_end, created_at
  ) values (
    p_reservation_id, p_user_id, p_feature, p_quantity, null, 0,
    v_entitlement.unit, 'PENDING', v_plan.plan_id,
    case
      when v_plan.plan_id = coalesce(v_assignment.plan_id, 'plan.free')
        then coalesce(v_assignment.plan_version, v_plan.version)
      else v_plan.version
    end,
    v_period.period_start, v_period.period_end, v_now
  );

  select * into v_used from billing.quota_period_used(
    p_user_id, p_feature, v_entitlement.unit, v_period.period_start, v_now
  );
  v_remaining := greatest(0, v_limit - v_used.committed - v_used.reserved);
  return jsonb_build_object(
    'status', 'RESERVED',
    'reservation_id', p_reservation_id,
    'limit', v_limit,
    'used', v_used.committed,
    'reserved', v_used.reserved,
    'remaining', v_remaining,
    'unit', v_entitlement.unit,
    'period_start', v_period.period_start,
    'period_end', v_period.period_end,
    'overage_policy', 'COMMIT_ACTUAL_COUNT_OVERAGE'
  );
end;
$$;

