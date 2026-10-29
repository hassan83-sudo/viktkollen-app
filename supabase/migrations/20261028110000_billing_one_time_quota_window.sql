-- One-time paid quotas follow the verified 30-day subscription period.
-- Free plans and recurring subscriptions keep the calendar interval.
-- Does not change period dates, quota reservations, usage events, or prices.
-- Apply to Staging only.

alter table billing.subscriptions
  add column if not exists quota_window text not null default 'calendar';

alter table billing.subscriptions
  drop constraint if exists subscriptions_quota_window_known;
alter table billing.subscriptions
  add constraint subscriptions_quota_window_known
  check (quota_window in ('calendar', 'subscription'));

create or replace function billing.guard_quota_window()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.quota_window is null or new.quota_window not in ('calendar', 'subscription') then
    raise exception 'invalid_quota_window';
  end if;
  if tg_op = 'UPDATE'
     and new.quota_window is distinct from old.quota_window
     and (old.quota_window is distinct from 'calendar' or new.quota_window is distinct from 'subscription') then
    raise exception 'quota_window is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists subscriptions_quota_window_guard on billing.subscriptions;
create trigger subscriptions_quota_window_guard
before insert or update on billing.subscriptions
for each row execute function billing.guard_quota_window();

revoke all on function billing.guard_quota_window() from public, anon, authenticated, service_role;

-- Marks a verified one-time period. The only written column is quota_window.
create or replace function billing.mark_one_time_quota_window(p_subscription_id text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_subscription_id is null or p_subscription_id = '' then
    return;
  end if;
  update billing.subscriptions
  set quota_window = 'subscription'
  where subscription_id = p_subscription_id
    and quota_window = 'calendar'
    and cancel_at_period_end is true
    and current_period_end = current_period_start + interval '30 days';
end;
$$;

revoke all on function billing.mark_one_time_quota_window(text) from public, anon, authenticated, service_role;
grant execute on function billing.mark_one_time_quota_window(text) to service_role;

-- Paid calls already stored on the calendar stamp, created after payment.
-- Free-plan rows have a different plan_id and are not included.
create or replace function billing.quota_legacy_paid_used(
  p_user_id uuid,
  p_feature text,
  p_unit text,
  p_plan_id text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_now timestamptz
)
returns table (committed integer, reserved integer)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  return query
  select
    coalesce(sum(case
      when r.status = 'COMMITTED' then coalesce(r.actual_quantity, r.quantity)
      else 0
    end), 0)::integer,
    coalesce(sum(case
      when r.status = 'PENDING' and (r.expires_at is null or r.expires_at > p_now) then r.quantity
      else 0
    end), 0)::integer
  from billing.quota_reservations r
  where r.user_id = p_user_id
    and r.feature = p_feature
    and r.unit = p_unit
    and r.plan_id = p_plan_id
    and r.period_start is distinct from p_period_start
    and r.created_at >= p_period_start
    and r.created_at < p_period_end;
end;
$$;

revoke all on function billing.quota_legacy_paid_used(uuid, text, text, text, timestamptz, timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function billing.quota_legacy_paid_used(uuid, text, text, text, timestamptz, timestamptz, timestamptz) to service_role;

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
  v_calendar record;
  v_subscription billing.subscriptions%rowtype;
  v_use_subscription boolean := false;
  v_lock_start timestamptz;
  v_used record;
  v_legacy record;
  v_existing billing.quota_reservations%rowtype;
  v_remaining integer;
  v_limit integer;
  v_committed integer;
  v_reserved integer;
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

  select * into v_calendar from billing.period_bounds(v_plan.billing_interval, v_now);
  if v_plan.plan_id is distinct from 'plan.free' then
    select * into v_subscription
    from billing.subscriptions s
    where s.user_id = p_user_id
      and s.plan_id = v_plan.plan_id
      and s.quota_window = 'subscription'
      and s.status in ('TRIALING', 'ACTIVE', 'PAST_DUE')
      and s.current_period_start <= v_now
      and s.current_period_end > v_now
    order by s.current_period_end desc, s.subscription_id asc
    limit 1;
    v_use_subscription := found;
  end if;

  if v_use_subscription then
    select v_subscription.current_period_start as period_start,
           v_subscription.current_period_end as period_end
    into v_period;
  else
    v_period := v_calendar;
  end if;

  -- One lock order for every caller: earlier period start first.
  -- Pending paid rows that still carry the old calendar stamp are included,
  -- so a commit of those rows cannot pass a new reservation.
  for v_lock_start in
    select keys.key_start
    from (
      select v_period.period_start as key_start
      union
      select v_calendar.period_start
      union
      select r.period_start
      from billing.quota_reservations r
      where v_use_subscription
        and r.user_id = p_user_id
        and r.feature = p_feature
        and r.plan_id = v_plan.plan_id
        and r.status = 'PENDING'
        and r.period_start is distinct from v_period.period_start
        and r.created_at >= v_period.period_start
        and r.created_at < v_period.period_end
    ) keys
    order by keys.key_start
  loop
    perform billing.lock_quota_period(p_user_id, p_feature, v_lock_start);
  end loop;

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
  v_committed := coalesce(v_used.committed, 0);
  v_reserved := coalesce(v_used.reserved, 0);
  if v_use_subscription then
    select * into v_legacy from billing.quota_legacy_paid_used(
      p_user_id, p_feature, v_entitlement.unit, v_plan.plan_id,
      v_period.period_start, v_period.period_end, v_now
    );
    v_committed := v_committed + coalesce(v_legacy.committed, 0);
    v_reserved := v_reserved + coalesce(v_legacy.reserved, 0);
  end if;
  v_limit := v_entitlement.limit_value;
  v_remaining := greatest(0, v_limit - v_committed - v_reserved);
  if v_remaining < p_quantity then
    return jsonb_build_object(
      'status', 'DENIED_QUOTA_EXCEEDED',
      'limit', v_limit,
      'used', v_committed,
      'reserved', v_reserved,
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
  v_committed := coalesce(v_used.committed, 0);
  v_reserved := coalesce(v_used.reserved, 0);
  if v_use_subscription then
    select * into v_legacy from billing.quota_legacy_paid_used(
      p_user_id, p_feature, v_entitlement.unit, v_plan.plan_id,
      v_period.period_start, v_period.period_end, v_now
    );
    v_committed := v_committed + coalesce(v_legacy.committed, 0);
    v_reserved := v_reserved + coalesce(v_legacy.reserved, 0);
  end if;
  v_remaining := greatest(0, v_limit - v_committed - v_reserved);
  return jsonb_build_object(
    'status', 'RESERVED',
    'reservation_id', p_reservation_id,
    'limit', v_limit,
    'used', v_committed,
    'reserved', v_reserved,
    'remaining', v_remaining,
    'unit', v_entitlement.unit,
    'period_start', v_period.period_start,
    'period_end', v_period.period_end,
    'overage_policy', 'COMMIT_ACTUAL_COUNT_OVERAGE'
  );
end;
$$;

create or replace function billing.activate_verified_one_time_checkout(
  p_checkout_id text,
  p_provider text,
  p_provider_event_id text,
  p_provider_customer_ref text,
  p_provider_subscription_ref text,
  p_provider_checkout_ref text,
  p_paid_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing billing.checkout_intents;
  created billing.subscriptions;
  assigned billing.user_plan_assignments;
  period_start timestamptz;
  period_end timestamptz;
begin
  if p_provider_event_id is null
     or p_provider_event_id !~ '^[A-Za-z0-9._:-]+$'
     or char_length(p_provider_event_id) > 120
     or p_provider_customer_ref is null
     or p_provider_customer_ref !~ '^[A-Za-z0-9._:-]{1,120}$'
     or p_provider_subscription_ref is null
     or p_provider_subscription_ref !~ '^[A-Za-z0-9._:-]{1,120}$'
     or p_provider_checkout_ref is null
     or p_provider_checkout_ref !~ '^[A-Za-z0-9._:-]{1,120}$'
     or p_paid_at is null
     or p_paid_at > pg_catalog.now() + interval '5 minutes' then
    raise exception 'invalid_provider_event';
  end if;

  select * into existing
  from billing.checkout_intents
  where checkout_id = p_checkout_id
  for update;
  if not found then
    raise exception 'checkout_intent_missing';
  end if;
  if existing.provider is distinct from p_provider then
    raise exception 'provider_mismatch';
  end if;
  if existing.provider_checkout_ref = ''
     or existing.provider_checkout_ref is distinct from p_provider_checkout_ref then
    raise exception 'provider_checkout_mismatch';
  end if;

  -- Repeated confirmation returns the stored period and does not create another.
  if existing.status = 'consumed' then
    if existing.provider_event_id is distinct from p_provider_event_id then
      raise exception 'checkout_intent_consumed';
    end if;
    select * into created from billing.subscriptions where subscription_id = existing.subscription_id;
    if created.user_id is distinct from existing.user_id
       or created.plan_id is distinct from existing.plan_id
       or created.provider_subscription_ref is distinct from p_provider_subscription_ref then
      raise exception 'duplicate_external_event';
    end if;
    perform billing.mark_one_time_quota_window(created.subscription_id);
    select * into assigned from billing.user_plan_assignments where user_id = existing.user_id;
    return pg_catalog.jsonb_build_object(
      'access_granted', true,
      'assignment_plan_id', assigned.plan_id,
      'current_period_end', created.current_period_end,
      'current_period_start', created.current_period_start,
      'plan_id', existing.plan_id,
      'status', created.status,
      'subscription_id', created.subscription_id,
      'user_id', existing.user_id
    );
  end if;
  if existing.status = 'cancelled' then
    raise exception 'checkout_intent_cancelled';
  end if;
  if existing.status <> 'pending' then
    raise exception 'checkout_intent_expired';
  end if;
  if p_paid_at < existing.created_at - interval '1 minute'
     or p_paid_at > existing.expires_at + interval '2 minutes' then
    raise exception 'checkout_intent_expired';
  end if;

  if exists (
    select 1 from billing.subscriptions stored
    where stored.provider = p_provider and stored.provider_subscription_ref = p_provider_subscription_ref
  ) or exists (
    select 1 from billing.checkout_intents other
    where other.provider_event_id = p_provider_event_id and other.checkout_id is distinct from existing.checkout_id
  ) then
    raise exception 'provider_subscription_conflict';
  end if;

  perform billing.expire_due_one_time_access(existing.user_id);

  period_start := p_paid_at;
  period_end := p_paid_at + interval '30 days';
  if period_end <= pg_catalog.now() then
    raise exception 'checkout_intent_expired';
  end if;

  created := billing.create_subscription(
    p_user_id => existing.user_id,
    p_plan_id => existing.plan_id,
    p_status => 'ACTIVE',
    p_period_start => period_start,
    p_period_end => period_end,
    p_cancel_at_period_end => true,
    p_external_event_id => p_provider_event_id,
    p_past_due_grace_until => null,
    p_pending_plan_id => null,
    p_pending_plan_change => null
  );
  if created.user_id is distinct from existing.user_id or created.plan_id is distinct from existing.plan_id then
    raise exception 'checkout_binding_mismatch';
  end if;

  update billing.subscriptions
  set
    provider = p_provider,
    provider_customer_ref = p_provider_customer_ref,
    provider_subscription_ref = p_provider_subscription_ref
  where subscription_id = created.subscription_id
    and provider = ''
    and provider_customer_ref = ''
    and provider_subscription_ref = ''
  returning * into created;
  if created.provider is distinct from p_provider
     or created.provider_subscription_ref is distinct from p_provider_subscription_ref then
    raise exception 'provider_subscription_conflict';
  end if;

  perform billing.mark_one_time_quota_window(created.subscription_id);

  assigned := billing.sync_plan_assignment_from_subscription(created.subscription_id, p_provider_event_id);
  if assigned.user_id is distinct from existing.user_id or assigned.plan_id is distinct from existing.plan_id then
    raise exception 'assignment_sync_unconfirmed';
  end if;

  update billing.checkout_intents
  set
    consumed_at = pg_catalog.now(),
    provider_event_id = p_provider_event_id,
    status = 'consumed',
    subscription_id = created.subscription_id
  where checkout_id = existing.checkout_id;

  return pg_catalog.jsonb_build_object(
    'access_granted', true,
    'assignment_plan_id', assigned.plan_id,
    'current_period_end', created.current_period_end,
    'current_period_start', created.current_period_start,
    'plan_id', existing.plan_id,
    'status', created.status,
    'subscription_id', created.subscription_id,
    'user_id', existing.user_id
  );
exception
  when unique_violation then
    raise exception 'provider_subscription_conflict';
end;
$$;

-- Existing verified hosted one-time periods. Period dates stay as stored.
select billing.mark_one_time_quota_window(s.subscription_id)
from billing.subscriptions s
where s.quota_window = 'calendar'
  and s.cancel_at_period_end is true
  and s.current_period_end = s.current_period_start + interval '30 days'
  and exists (
    select 1
    from billing.checkout_intents i
    where i.subscription_id = s.subscription_id
      and i.status = 'consumed'
      and i.provider_hosted_url <> ''
  );
