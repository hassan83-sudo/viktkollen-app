-- BILL-2 plan assignment + quota reservations. DO NOT apply to production
-- without the same isolated staging review as BILL-1E.
-- Structure only. Payment providers are out of scope.
-- Does not ALTER billing.usage_events (BILL-1 live schema stays append-only).
--
-- Atomic reserve uses billing.quota_period_locks + SELECT FOR UPDATE in one
-- transaction inside SECURITY DEFINER functions. That lock is PostgreSQL
-- session/transaction scoped, so two Vercel isolates cannot both consume the
-- last unit. asyncMutex in Node is not the security boundary.
-- Functions execute as table owner; EXECUTE is granted only to service_role.
-- authenticated/anon/public cannot mutate quota or execute these functions.
-- Caller must pass the trusted server-derived user id (JWT verified in API).

create schema if not exists billing;

revoke all on schema billing from public, anon, authenticated;
grant usage on schema billing to service_role;

create table if not exists billing.plans (
  plan_id text primary key,
  name text not null,
  price_minor integer not null,
  currency text not null,
  billing_interval text not null,
  active boolean not null default true,
  display_order integer not null default 0,
  version integer not null,
  price_status text not null,
  created_at timestamptz not null default now(),
  constraint plans_id_len check (char_length(plan_id) between 1 and 80),
  constraint plans_name_len check (char_length(name) between 1 and 80),
  constraint plans_price_minor_nonneg check (price_minor >= 0 and price_minor <= 1000000000),
  constraint plans_currency_known check (currency in ('SEK')),
  constraint plans_interval_known check (billing_interval in ('day', 'week', 'month')),
  constraint plans_version_positive check (version >= 1),
  constraint plans_price_status_known check (price_status in ('PRELIMINARY', 'ADMIN-CONFIGURABLE'))
);

create table if not exists billing.plan_entitlements (
  plan_id text not null references billing.plans (plan_id),
  feature text not null,
  enabled boolean not null,
  limit_kind text not null,
  limit_value integer,
  unit text not null,
  quota_status text not null,
  constraint plan_entitlements_pk primary key (plan_id, feature),
  constraint plan_entitlements_feature_len check (char_length(feature) between 1 and 80),
  constraint plan_entitlements_feature_known check (feature in (
    'ai.ear.interpret',
    'ai.eye.analysis',
    'ai.text.request',
    'ai.voice.session',
    'body.scan',
    'food.scan',
    'gps.live.session',
    'tts.request',
    'friend_chat',
    'gps_standard',
    'ready_avatar',
    'smart_ai'
  )),
  constraint plan_entitlements_limit_kind_known check (limit_kind in ('NUMBER', 'UNLIMITED')),
  constraint plan_entitlements_unlimited_null check (
    (limit_kind = 'UNLIMITED' and limit_value is null)
    or (limit_kind = 'NUMBER' and limit_value is not null and limit_value >= 0 and limit_value <= 1000000000)
  ),
  constraint plan_entitlements_unit_known check (unit in (
    'requests',
    'tokens',
    'seconds',
    'images',
    'sessions',
    'writes',
    'reads'
  )),
  constraint plan_entitlements_quota_status_known check (quota_status in ('PRELIMINARY', 'ADMIN-CONFIGURABLE'))
);

create table if not exists billing.user_plan_assignments (
  user_id uuid primary key,
  plan_id text not null references billing.plans (plan_id),
  plan_version integer not null,
  source text not null,
  assigned_at timestamptz not null default now(),
  constraint user_plan_source_known check (source in ('server', 'server-default', 'admin-seed')),
  constraint user_plan_version_positive check (plan_version >= 1)
);

create table if not exists billing.quota_period_locks (
  user_id uuid not null,
  feature text not null,
  period_start timestamptz not null,
  constraint quota_period_locks_pk primary key (user_id, feature, period_start)
);

create table if not exists billing.quota_reservations (
  reservation_id text primary key,
  user_id uuid not null,
  feature text not null,
  quantity integer not null,
  actual_quantity integer,
  overage_quantity integer not null default 0,
  unit text not null,
  status text not null,
  plan_id text not null references billing.plans (plan_id),
  plan_version integer not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  committed_at timestamptz,
  rolled_back_at timestamptz,
  constraint quota_res_id_len check (char_length(reservation_id) between 1 and 180),
  constraint quota_res_feature_len check (char_length(feature) between 1 and 80),
  constraint quota_res_feature_known check (feature in (
    'ai.ear.interpret',
    'ai.eye.analysis',
    'ai.text.request',
    'ai.voice.session',
    'body.scan',
    'food.scan',
    'gps.live.session',
    'tts.request',
    'friend_chat',
    'gps_standard',
    'ready_avatar',
    'smart_ai'
  )),
  constraint quota_res_quantity_nonneg check (quantity >= 0 and quantity <= 1000000000),
  constraint quota_res_actual_nonneg check (
    actual_quantity is null
    or (actual_quantity >= 0 and actual_quantity <= 1000000000)
  ),
  constraint quota_res_overage_nonneg check (overage_quantity >= 0 and overage_quantity <= 1000000000),
  constraint quota_res_period_order check (period_end > period_start),
  constraint quota_res_unit_known check (unit in (
    'requests',
    'tokens',
    'seconds',
    'images',
    'sessions',
    'writes',
    'reads'
  )),
  constraint quota_res_status_known check (status in ('PENDING', 'COMMITTED', 'ROLLED_BACK', 'EXPIRED')),
  constraint quota_res_insert_pending check (status = 'PENDING' or status = 'COMMITTED' or status = 'ROLLED_BACK' or status = 'EXPIRED'),
  constraint quota_res_plan_version_positive check (plan_version >= 1)
);

create index if not exists quota_reservations_user_feature_period_idx
  on billing.quota_reservations (user_id, feature, period_start, status);

create index if not exists quota_reservations_pending_idx
  on billing.quota_reservations (user_id, feature, period_start)
  where status = 'PENDING';

comment on table billing.plans is
  'BILL-2 plan catalog foundation. Prices are PRELIMINARY / ADMIN-CONFIGURABLE. No payment provider columns.';

comment on table billing.quota_reservations is
  'Quota reservations only. No prompts, audio, images, coordinates, chat, passwords, or payment data.';

comment on table billing.quota_period_locks is
  'Per user/feature/period row taken with SELECT FOR UPDATE during reserve/commit/rollback.';

comment on column billing.plan_entitlements.limit_kind is
  'NUMBER or UNLIMITED. Unlimited is an explicit limit_kind, never a magic integer.';

create or replace function billing.quota_reservation_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'PENDING' then
      raise exception 'billing.quota_reservations insert status must be PENDING';
    end if;
    if new.period_end <= new.period_start then
      raise exception 'billing.quota_reservations period_end must be after period_start';
    end if;
    return new;
  end if;

  if new.reservation_id is distinct from old.reservation_id
    or new.user_id is distinct from old.user_id
    or new.feature is distinct from old.feature
    or new.quantity is distinct from old.quantity
    or new.unit is distinct from old.unit
    or new.plan_id is distinct from old.plan_id
    or new.plan_version is distinct from old.plan_version
    or new.period_start is distinct from old.period_start
    or new.period_end is distinct from old.period_end
    or new.created_at is distinct from old.created_at
  then
    raise exception 'billing.quota_reservations identity columns are immutable';
  end if;

  if old.status = 'PENDING' then
    if new.status not in ('PENDING', 'COMMITTED', 'ROLLED_BACK', 'EXPIRED') then
      raise exception 'billing.quota_reservations illegal status transition';
    end if;
    if new.status = 'COMMITTED' and new.actual_quantity is null then
      raise exception 'billing.quota_reservations commit requires actual_quantity';
    end if;
    return new;
  end if;

  if old.status in ('COMMITTED', 'ROLLED_BACK', 'EXPIRED') then
    if new.status is distinct from old.status
      or new.actual_quantity is distinct from old.actual_quantity
      or new.overage_quantity is distinct from old.overage_quantity
      or new.committed_at is distinct from old.committed_at
      or new.rolled_back_at is distinct from old.rolled_back_at
      or new.expires_at is distinct from old.expires_at
    then
      raise exception 'billing.quota_reservations terminal state is immutable';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists quota_reservations_immutable on billing.quota_reservations;
drop trigger if exists quota_reservations_guard on billing.quota_reservations;
create trigger quota_reservations_guard
before insert or update on billing.quota_reservations
for each row
execute function billing.quota_reservation_guard();

create or replace function billing.period_bounds(p_interval text, p_at timestamptz)
returns table (period_start timestamptz, period_end timestamptz)
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $$
declare
  start_at timestamp;
begin
  if p_interval is null or p_interval not in ('day', 'week', 'month') then
    raise exception 'invalid_billing_interval';
  end if;
  start_at := date_trunc(p_interval, p_at at time zone 'UTC');
  period_start := start_at at time zone 'UTC';
  if p_interval = 'day' then
    period_end := (start_at + interval '1 day') at time zone 'UTC';
  elsif p_interval = 'week' then
    period_end := (start_at + interval '7 days') at time zone 'UTC';
  else
    period_end := (start_at + interval '1 month') at time zone 'UTC';
  end if;
  return next;
end;
$$;

create or replace function billing.lock_quota_period(p_user_id uuid, p_feature text, p_period_start timestamptz)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  insert into billing.quota_period_locks (user_id, feature, period_start)
  values (p_user_id, p_feature, p_period_start)
  on conflict (user_id, feature, period_start) do nothing;
  perform 1
  from billing.quota_period_locks
  where user_id = p_user_id
    and feature = p_feature
    and period_start = p_period_start
  for update;
end;
$$;

create or replace function billing.quota_period_used(
  p_user_id uuid,
  p_feature text,
  p_unit text,
  p_period_start timestamptz,
  p_now timestamptz
)
returns table (committed integer, reserved integer)
language plpgsql
stable
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
      when r.status = 'PENDING'
        and (r.expires_at is null or r.expires_at > p_now)
      then r.quantity
      else 0
    end), 0)::integer
  from billing.quota_reservations r
  where r.user_id = p_user_id
    and r.feature = p_feature
    and r.unit = p_unit
    and r.period_start = p_period_start;
end;
$$;

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
    v_entitlement.unit, 'PENDING', v_plan.plan_id, coalesce(v_assignment.plan_version, v_plan.version),
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

create or replace function billing.commit_quota(p_reservation_id text, p_actual_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_row billing.quota_reservations%rowtype;
  v_used record;
  v_limit integer;
  v_entitlement billing.plan_entitlements%rowtype;
  v_overage integer;
  v_actual integer;
begin
  select * into v_row from billing.quota_reservations where reservation_id = p_reservation_id;
  if not found then
    return jsonb_build_object('status', 'DENIED_UNKNOWN_FEATURE');
  end if;

  perform billing.lock_quota_period(v_row.user_id, v_row.feature, v_row.period_start);

  select * into v_row from billing.quota_reservations where reservation_id = p_reservation_id;
  if v_row.status = 'COMMITTED' then
    return jsonb_build_object(
      'status', 'COMMITTED',
      'reservation_id', v_row.reservation_id,
      'used', coalesce(v_row.actual_quantity, v_row.quantity),
      'overage_quantity', v_row.overage_quantity,
      'unit', v_row.unit,
      'period_start', v_row.period_start,
      'period_end', v_row.period_end
    );
  end if;
  if v_row.status is distinct from 'PENDING' then
    return jsonb_build_object('status', v_row.status, 'reservation_id', v_row.reservation_id, 'unit', v_row.unit);
  end if;

  v_actual := coalesce(p_actual_quantity, v_row.quantity);
  if v_actual < 0 or v_actual > 1000000000 then
    return jsonb_build_object('status', 'DENIED_INVALID_QUANTITY', 'reservation_id', v_row.reservation_id);
  end if;
  v_overage := greatest(0, v_actual - v_row.quantity);

  update billing.quota_reservations
  set actual_quantity = v_actual,
      overage_quantity = v_overage,
      status = 'COMMITTED',
      committed_at = v_now
  where reservation_id = p_reservation_id;

  select * into v_entitlement
  from billing.plan_entitlements
  where plan_id = v_row.plan_id and feature = v_row.feature;
  v_limit := v_entitlement.limit_value;
  select * into v_used from billing.quota_period_used(
    v_row.user_id, v_row.feature, v_row.unit, v_row.period_start, v_now
  );
  return jsonb_build_object(
    'status', 'COMMITTED',
    'reservation_id', p_reservation_id,
    'limit', v_limit,
    'used', v_used.committed,
    'reserved', v_used.reserved,
    'remaining', greatest(0, coalesce(v_limit, 0) - v_used.committed - v_used.reserved),
    'overage_quantity', v_overage,
    'integrity', case when v_overage > 0 then 'OVERAGE' else null end,
    'overage_policy', 'COMMIT_ACTUAL_COUNT_OVERAGE',
    'unit', v_row.unit,
    'period_start', v_row.period_start,
    'period_end', v_row.period_end
  );
end;
$$;

create or replace function billing.rollback_quota(p_reservation_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_row billing.quota_reservations%rowtype;
  v_used record;
  v_entitlement billing.plan_entitlements%rowtype;
begin
  select * into v_row from billing.quota_reservations where reservation_id = p_reservation_id;
  if not found then
    return jsonb_build_object('status', 'DENIED_UNKNOWN_FEATURE');
  end if;

  perform billing.lock_quota_period(v_row.user_id, v_row.feature, v_row.period_start);
  select * into v_row from billing.quota_reservations where reservation_id = p_reservation_id;

  if v_row.status = 'COMMITTED' then
    return jsonb_build_object('status', 'COMMITTED', 'reservation_id', v_row.reservation_id, 'unit', v_row.unit);
  end if;
  if v_row.status = 'ROLLED_BACK' then
    select * into v_entitlement from billing.plan_entitlements
    where plan_id = v_row.plan_id and feature = v_row.feature;
    select * into v_used from billing.quota_period_used(
      v_row.user_id, v_row.feature, v_row.unit, v_row.period_start, v_now
    );
    return jsonb_build_object(
      'status', 'ROLLED_BACK',
      'reservation_id', v_row.reservation_id,
      'remaining', greatest(0, coalesce(v_entitlement.limit_value, 0) - v_used.committed - v_used.reserved),
      'unit', v_row.unit
    );
  end if;
  if v_row.status is distinct from 'PENDING' then
    return jsonb_build_object('status', v_row.status, 'reservation_id', v_row.reservation_id);
  end if;

  update billing.quota_reservations
  set status = 'ROLLED_BACK',
      rolled_back_at = v_now
  where reservation_id = p_reservation_id;

  select * into v_entitlement from billing.plan_entitlements
  where plan_id = v_row.plan_id and feature = v_row.feature;
  select * into v_used from billing.quota_period_used(
    v_row.user_id, v_row.feature, v_row.unit, v_row.period_start, v_now
  );
  return jsonb_build_object(
    'status', 'ROLLED_BACK',
    'reservation_id', p_reservation_id,
    'remaining', greatest(0, coalesce(v_entitlement.limit_value, 0) - v_used.committed - v_used.reserved),
    'unit', v_row.unit,
    'period_start', v_row.period_start,
    'period_end', v_row.period_end
  );
end;
$$;

revoke all on function billing.quota_reservation_guard() from public, anon, authenticated;
revoke all on function billing.period_bounds(text, timestamptz) from public, anon, authenticated;
revoke all on function billing.lock_quota_period(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function billing.quota_period_used(uuid, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function billing.reserve_quota(uuid, text, text, integer, text) from public, anon, authenticated;
revoke all on function billing.commit_quota(text, integer) from public, anon, authenticated;
revoke all on function billing.rollback_quota(text) from public, anon, authenticated;

grant execute on function billing.reserve_quota(uuid, text, text, integer, text) to service_role;
grant execute on function billing.commit_quota(text, integer) to service_role;
grant execute on function billing.rollback_quota(text) to service_role;

alter table billing.plans enable row level security;
alter table billing.plans force row level security;
alter table billing.plan_entitlements enable row level security;
alter table billing.plan_entitlements force row level security;
alter table billing.user_plan_assignments enable row level security;
alter table billing.user_plan_assignments force row level security;
alter table billing.quota_period_locks enable row level security;
alter table billing.quota_period_locks force row level security;
alter table billing.quota_reservations enable row level security;
alter table billing.quota_reservations force row level security;

revoke all privileges on table billing.plans from public, anon, authenticated;
revoke all privileges on table billing.plan_entitlements from public, anon, authenticated;
revoke all privileges on table billing.user_plan_assignments from public, anon, authenticated;
revoke all privileges on table billing.quota_period_locks from public, anon, authenticated;
revoke all privileges on table billing.quota_reservations from public, anon, authenticated;

grant select, insert, update on table billing.plans to service_role;
grant select, insert, update on table billing.plan_entitlements to service_role;
grant select, insert, update on table billing.user_plan_assignments to service_role;
grant select, insert on table billing.quota_period_locks to service_role;
grant select, insert, update on table billing.quota_reservations to service_role;

revoke delete on table billing.plans from public, anon, authenticated, service_role;
revoke delete on table billing.plan_entitlements from public, anon, authenticated, service_role;
revoke delete on table billing.user_plan_assignments from public, anon, authenticated, service_role;
revoke delete on table billing.quota_period_locks from public, anon, authenticated, service_role;
revoke delete on table billing.quota_reservations from public, anon, authenticated, service_role;

drop policy if exists "No direct client access to billing plans" on billing.plans;
create policy "No direct client access to billing plans"
on billing.plans as restrictive for all to public using (false) with check (false);

drop policy if exists "No direct client access to plan entitlements" on billing.plan_entitlements;
create policy "No direct client access to plan entitlements"
on billing.plan_entitlements as restrictive for all to public using (false) with check (false);

drop policy if exists "No direct client access to user plan assignments" on billing.user_plan_assignments;
create policy "No direct client access to user plan assignments"
on billing.user_plan_assignments as restrictive for all to public using (false) with check (false);

drop policy if exists "No direct client access to quota period locks" on billing.quota_period_locks;
create policy "No direct client access to quota period locks"
on billing.quota_period_locks as restrictive for all to public using (false) with check (false);

drop policy if exists "No direct client access to quota reservations" on billing.quota_reservations;
create policy "No direct client access to quota reservations"
on billing.quota_reservations as restrictive for all to public using (false) with check (false);

insert into billing.plans (
  plan_id, name, price_minor, currency, billing_interval, active, display_order, version, price_status
) values
  ('plan.free', 'Free', 0, 'SEK', 'month', true, 0, 1, 'PRELIMINARY')
on conflict (plan_id) do nothing;

insert into billing.plans (
  plan_id, name, price_minor, currency, billing_interval, active, display_order, version, price_status
)
select
  'plan.prelim.sek.month.' || lpad(major::text, 2, '0'),
  'Prelim ' || major::text || ' SEK/month',
  major * 100,
  'SEK',
  'month',
  true,
  ord,
  1,
  'PRELIMINARY'
from unnest(array[4, 7, 9, 12, 15, 19, 29, 39, 49, 59, 69, 79, 89, 99]) with ordinality as t(major, ord)
on conflict (plan_id) do nothing;

insert into billing.plan_entitlements (plan_id, feature, enabled, limit_kind, limit_value, unit, quota_status)
select p.plan_id, f.feature, true,
  case when f.metered then 'NUMBER' else 'UNLIMITED' end,
  case
    when not f.metered then null
    when p.plan_id = 'plan.free' then 5
    else 50 + ((p.display_order - 1) * 10)
  end,
  f.unit,
  'PRELIMINARY'
from billing.plans p
cross join (values
  ('ai.ear.interpret', true, 'requests'),
  ('ai.eye.analysis', true, 'requests'),
  ('ai.text.request', true, 'requests'),
  ('ai.voice.session', true, 'sessions'),
  ('body.scan', true, 'requests'),
  ('food.scan', true, 'requests'),
  ('gps.live.session', true, 'sessions'),
  ('tts.request', true, 'requests'),
  ('friend_chat', false, 'writes'),
  ('gps_standard', false, 'sessions'),
  ('ready_avatar', false, 'writes'),
  ('smart_ai', false, 'requests')
) as f(feature, metered, unit)
on conflict (plan_id, feature) do nothing;
