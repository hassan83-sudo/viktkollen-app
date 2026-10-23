-- Sandbox rollout only. No catalog prices are seeded; no subscription writes.
alter table billing.extra_scan_grants add column verified_paid_at timestamptz;
alter table billing.extra_scan_grants add column expires_at timestamptz;
-- Preparation had no live grants: fail closed if unexpected data exists.
alter table billing.extra_scan_grants alter column verified_paid_at set not null;
alter table billing.extra_scan_grants alter column expires_at set not null;
alter table billing.extra_scan_grants add constraint extra_expiry_exact
  check(expires_at = verified_paid_at + interval '720 hours');
alter table billing.extra_scan_allocations drop constraint extra_scan_allocations_pkey;
alter table billing.extra_scan_allocations add primary key(reservation_id,grant_id);

create table billing.extra_scan_intents (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  request_key uuid not null, feature text not null check(feature in ('food.scan','body.scan','ai.eye.analysis')),
  quantity integer not null check(quantity between 1 and 100),
  amount_minor integer not null check(amount_minor between 100 and 1000000),
  merchant_code text not null, provider_checkout_id uuid unique,
  hosted_url text, created_at timestamptz not null default clock_timestamp(),
  unique(user_id,request_key)
);
alter table billing.extra_scan_intents enable row level security;
alter table billing.extra_scan_intents force row level security;
revoke all on billing.extra_scan_intents from public,anon,authenticated,service_role;

-- Service-role-only. User identity comes from verified JWT, never the request body.
create function billing.extra_scan_purchase(p_action text,p_user_id uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare i billing.extra_scan_intents%rowtype; v_paid_grant billing.extra_scan_grants%rowtype; t timestamptz;
begin
  if p_action='create' then
    if p_user_id is null then raise exception 'user_required'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,26));
    select * into i from billing.extra_scan_intents where user_id=p_user_id and request_key=(p_data->>'request_key')::uuid;
    if found then
      if i.feature is distinct from p_data->>'feature' or i.quantity is distinct from (p_data->>'quantity')::int then raise exception 'intent_conflict'; end if;
      return to_jsonb(i);
    end if;
    if (select count(*) from billing.extra_scan_intents where user_id=p_user_id and created_at>clock_timestamp()-interval '10 minutes') >= 8 then raise exception 'purchase_rate_limited'; end if;
    insert into billing.extra_scan_intents(user_id,request_key,feature,quantity,amount_minor,merchant_code)
    values(p_user_id,(p_data->>'request_key')::uuid,p_data->>'feature',(p_data->>'quantity')::int,(p_data->>'amount_minor')::int,p_data->>'merchant_code') returning * into i;
    return to_jsonb(i);
  elsif p_action='allocations' then
    return coalesce((select jsonb_agg(to_jsonb(a)) from billing.extra_scan_allocations a join billing.quota_reservations r using(reservation_id) where r.user_id=p_user_id and a.status in ('PENDING','COMMITTED')),'[]'::jsonb);
  elsif p_action='balance' then
    return coalesce((select jsonb_agg(to_jsonb(b)) from (
      select g.id,g.feature,g.quantity,g.expires_at,g.verified_paid_at,g.status,
        greatest(0,g.quantity-coalesce((select sum(a.quantity) from billing.extra_scan_allocations a
          join billing.quota_reservations r using(reservation_id) where a.grant_id=g.id and
          (a.status='COMMITTED' or (a.status='PENDING' and r.status='PENDING' and (r.expires_at is null or r.expires_at>clock_timestamp())))),0)) remaining
      from billing.extra_scan_grants g where g.user_id=p_user_id and g.status='VERIFIED_PAID' and g.expires_at>clock_timestamp()
      order by g.expires_at,g.id) b),'[]'::jsonb);
  end if;
  select * into i from billing.extra_scan_intents where id=(p_data->>'id')::uuid
    and (user_id=p_user_id or (p_user_id is null and p_action='lookup_webhook')) for update;
  if not found then raise exception 'intent_missing'; end if;
  if p_action in ('read','lookup_webhook') then return to_jsonb(i); end if;
  if p_action='bind' then
    if i.provider_checkout_id is not null and i.provider_checkout_id is distinct from (p_data->>'provider_checkout_id')::uuid then raise exception 'checkout_conflict'; end if;
    update billing.extra_scan_intents set provider_checkout_id=(p_data->>'provider_checkout_id')::uuid,hosted_url=p_data->>'hosted_url' where id=i.id returning * into i;
    return to_jsonb(i);
  elsif p_action='grant' then
    if i.provider_checkout_id is null or i.provider_checkout_id is distinct from (p_data->>'provider_checkout_id')::uuid then raise exception 'checkout_mismatch'; end if;
    perform pg_advisory_xact_lock(hashtextextended(i.user_id::text || i.feature,24));
    select * into v_paid_grant from billing.extra_scan_grants where payment_ref=i.provider_checkout_id::text;
    if found then return to_jsonb(v_paid_grant); end if;
    -- Database clock is authoritative; retries never restart the 30 days.
    t := clock_timestamp();
    insert into billing.extra_scan_grants(user_id,feature,unit,payment_ref,quantity,status,verified_paid_at,expires_at)
      values(i.user_id,i.feature,'requests',i.provider_checkout_id::text,i.quantity,'VERIFIED_PAID',t,t+interval '720 hours') returning * into v_paid_grant;
    return to_jsonb(v_paid_grant);
  elsif p_action='reverse' then
    perform pg_advisory_xact_lock(hashtextextended(i.user_id::text || i.feature,24));
    update billing.quota_reservations set status='ROLLED_BACK',rolled_back_at=clock_timestamp()
      where status='PENDING' and reservation_id in (select a.reservation_id from billing.extra_scan_allocations a
        join billing.extra_scan_grants g on g.id=a.grant_id where g.payment_ref=i.provider_checkout_id::text);
    update billing.extra_scan_grants set status='REVERSED' where payment_ref=i.provider_checkout_id::text;
    return jsonb_build_object('status','REVERSED');
  end if;
  raise exception 'unknown_action';
end; $$;
revoke all on function billing.extra_scan_purchase(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function billing.extra_scan_purchase(text,uuid,jsonb) to service_role;
create or replace function billing.lock_quota_period(p_user_id uuid, p_feature text, p_period_start timestamptz)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || p_feature, 24));
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
      when r.status = 'COMMITTED' then greatest(0, coalesce(r.actual_quantity, r.quantity) - coalesce((select sum(a.quantity) from billing.extra_scan_allocations a where a.reservation_id = r.reservation_id and a.status = 'COMMITTED'), 0))
      else 0
    end), 0)::integer,
    coalesce(sum(case
      when r.status = 'PENDING'
        and (r.expires_at is null or r.expires_at > p_now)
      then greatest(0, r.quantity - coalesce((select sum(a.quantity) from billing.extra_scan_allocations a where a.reservation_id = r.reservation_id and a.status = 'PENDING'), 0))
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
  v_extra integer;
  v_need integer;
  v_take integer;
  v_grant record;
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

  perform pg_advisory_xact_lock(hashtextextended(p_reservation_id, 25));
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || p_feature, 24));
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
        when 'PENDING' then case when v_existing.expires_at <= clock_timestamp() then 'EXPIRED' else 'RESERVED' end
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
  v_now := clock_timestamp();

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
  v_need := greatest(0, p_quantity - v_remaining);
  select coalesce(sum(g.quantity - coalesce((select sum(a.quantity)
    from billing.extra_scan_allocations a join billing.quota_reservations r using(reservation_id)
    where a.grant_id=g.id and (a.status='COMMITTED' or (a.status='PENDING' and
      r.status='PENDING' and (r.expires_at is null or r.expires_at > clock_timestamp())))),0)),0)
    into v_extra from billing.extra_scan_grants g
    where g.user_id=p_user_id and g.feature=p_feature and g.unit=v_entitlement.unit
      and g.status='VERIFIED_PAID' and g.expires_at > clock_timestamp();
  if v_remaining + v_extra < p_quantity then
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

  update billing.quota_reservations set expires_at=clock_timestamp()+interval '15 minutes'
    where reservation_id=p_reservation_id and p_feature in ('food.scan','body.scan','ai.eye.analysis');
  for v_grant in select g.*, g.quantity - coalesce((select sum(a.quantity)
      from billing.extra_scan_allocations a join billing.quota_reservations r using(reservation_id)
      where a.grant_id=g.id and (a.status='COMMITTED' or (a.status='PENDING' and
        r.status='PENDING' and (r.expires_at is null or r.expires_at > clock_timestamp())))),0) available
    from billing.extra_scan_grants g where g.user_id=p_user_id and g.feature=p_feature
      and g.unit=v_entitlement.unit and g.status='VERIFIED_PAID' and g.expires_at > clock_timestamp()
    order by g.expires_at,g.id for update of g
  loop
    exit when v_need=0;
    v_take := least(v_need, v_grant.available);
    if v_take > 0 then
      insert into billing.extra_scan_allocations(reservation_id,grant_id,quantity,status)
        values(p_reservation_id,v_grant.id,v_take,'PENDING');
      v_need := v_need-v_take;
    end if;
  end loop;
  if v_need > 0 then raise exception 'extra_scan_allocation_failed'; end if;
  update billing.quota_reservations r set expires_at=least(r.expires_at,
    (select min(g.expires_at) from billing.extra_scan_allocations a join billing.extra_scan_grants g on g.id=a.grant_id where a.reservation_id=r.reservation_id))
    where r.reservation_id=p_reservation_id and exists(select 1 from billing.extra_scan_allocations a where a.reservation_id=r.reservation_id);
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

create or replace function billing.sync_extra_scan_allocation()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_monthly integer; v_left integer; a record; v_take integer;
begin
  if old.status <> 'PENDING' then return new; end if;
  if new.status in ('ROLLED_BACK','EXPIRED') then
    update billing.extra_scan_allocations set status='ROLLED_BACK' where reservation_id=new.reservation_id;
  elsif new.status='COMMITTED' then
    select new.quantity-coalesce(sum(quantity),0) into v_monthly
      from billing.extra_scan_allocations where reservation_id=new.reservation_id;
    v_left := greatest(0,new.actual_quantity-v_monthly);
    for a in select x.* from billing.extra_scan_allocations x join billing.extra_scan_grants g on g.id=x.grant_id
      where x.reservation_id=new.reservation_id order by g.expires_at,g.id
    loop
      v_take := least(v_left,a.quantity);
      if v_take=0 then
        update billing.extra_scan_allocations set status='ROLLED_BACK' where reservation_id=a.reservation_id and grant_id=a.grant_id;
      else
        update billing.extra_scan_allocations set quantity=v_take,status='COMMITTED' where reservation_id=a.reservation_id and grant_id=a.grant_id;
        v_left := v_left-v_take;
      end if;
    end loop;
  end if;
  return new;
end; $$;
create trigger sync_extra_scan_allocation after update on billing.quota_reservations
for each row execute function billing.sync_extra_scan_allocation();
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

  if v_row.expires_at <= clock_timestamp() then
    update billing.quota_reservations set status='EXPIRED' where reservation_id=p_reservation_id;
    return jsonb_build_object('status','EXPIRED','reservation_id',p_reservation_id);
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


revoke all on function billing.sync_extra_scan_allocation() from public,anon,authenticated,service_role;
