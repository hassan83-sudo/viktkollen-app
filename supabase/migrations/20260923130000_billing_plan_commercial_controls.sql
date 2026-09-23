-- BILL-6B2A server-controlled paid-plan availability.
-- Local migration only. DO NOT apply to staging. DO NOT apply to production in this sprint.
-- Does not change plan price, entitlements, quotas, subscriptions, or usage.
-- Missing rows mean not for sale. featured is reserved and locked off.

create table if not exists billing.plan_commercial_controls (
  plan_id text primary key,
  enabled_for_sale boolean not null default false,
  display_order integer not null,
  featured boolean not null default false,
  version integer not null,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid not null,
  constraint plan_commercial_plan_known check (plan_id in (
    'plan.prelim.sek.month.04',
    'plan.prelim.sek.month.07',
    'plan.prelim.sek.month.09',
    'plan.prelim.sek.month.12',
    'plan.prelim.sek.month.15',
    'plan.prelim.sek.month.19',
    'plan.prelim.sek.month.29',
    'plan.prelim.sek.month.39',
    'plan.prelim.sek.month.49',
    'plan.prelim.sek.month.59',
    'plan.prelim.sek.month.69',
    'plan.prelim.sek.month.79',
    'plan.prelim.sek.month.89',
    'plan.prelim.sek.month.99'
  )),
  constraint plan_commercial_order_bounds check (display_order between 1 and 14),
  constraint plan_commercial_version_positive check (version >= 1),
  constraint plan_commercial_featured_locked check (featured = false),
  constraint plan_commercial_order_uidx unique (display_order) deferrable initially deferred
);

alter table billing.plan_commercial_controls enable row level security;
alter table billing.plan_commercial_controls force row level security;

drop policy if exists plan_commercial_controls_deny_all on billing.plan_commercial_controls;
create policy plan_commercial_controls_deny_all
on billing.plan_commercial_controls
for all
to public
using (false)
with check (false);

revoke all on table billing.plan_commercial_controls from public, anon, authenticated, service_role;

alter table billing.admin_audit drop constraint if exists admin_audit_action_known;
alter table billing.admin_audit add constraint admin_audit_action_known check (action in (
  'permission.grant',
  'permission.revoke',
  'feature.control.created',
  'feature.control.changed',
  'provider.control.created',
  'provider.control.changed',
  'cost.threshold.created',
  'cost.threshold.changed',
  'plan.commercial.changed'
));

alter table billing.admin_audit drop constraint if exists admin_audit_target_type_known;
alter table billing.admin_audit add constraint admin_audit_target_type_known check (target_type in (
  'admin_permission',
  'feature_control',
  'provider_control',
  'cost_threshold',
  'plan_commercial'
));

create or replace function billing.paid_candidate_plans()
returns table(plan_id text, display_order integer)
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select catalog.plan_id, catalog.display_order
  from (
    values
      ('plan.prelim.sek.month.04'::text, 1),
      ('plan.prelim.sek.month.07'::text, 2),
      ('plan.prelim.sek.month.09'::text, 3),
      ('plan.prelim.sek.month.12'::text, 4),
      ('plan.prelim.sek.month.15'::text, 5),
      ('plan.prelim.sek.month.19'::text, 6),
      ('plan.prelim.sek.month.29'::text, 7),
      ('plan.prelim.sek.month.39'::text, 8),
      ('plan.prelim.sek.month.49'::text, 9),
      ('plan.prelim.sek.month.59'::text, 10),
      ('plan.prelim.sek.month.69'::text, 11),
      ('plan.prelim.sek.month.79'::text, 12),
      ('plan.prelim.sek.month.89'::text, 13),
      ('plan.prelim.sek.month.99'::text, 14)
  ) as catalog(plan_id, display_order)
$$;

create or replace function billing.guard_plan_commercial_row()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'plan_commercial_controls are not deletable';
  end if;
  if new.featured is distinct from false then
    raise exception 'featured is not editable';
  end if;
  if tg_op = 'INSERT' then
    if new.version <> 1 then
      raise exception 'initial plan commercial version must be 1';
    end if;
    return new;
  end if;
  if new.plan_id is distinct from old.plan_id then
    raise exception 'plan commercial identity is immutable';
  end if;
  if new.version is distinct from old.version + 1 then
    raise exception 'plan commercial version must increase by 1';
  end if;
  return new;
end;
$$;

drop trigger if exists plan_commercial_controls_guard on billing.plan_commercial_controls;
create trigger plan_commercial_controls_guard
before insert or update or delete on billing.plan_commercial_controls
for each row execute function billing.guard_plan_commercial_row();

create or replace function billing.admin_audit_snapshot(p_input jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  k text;
  v jsonb;
  lowered text;
  copied jsonb := '{}'::jsonb;
  val text;
  ver integer;
  amount bigint;
  display_order integer;
begin
  if p_input is null then
    return '{}'::jsonb;
  end if;
  if pg_catalog.octet_length(p_input::text) > 2048 then
    raise exception 'audit_payload_too_large';
  end if;
  if pg_catalog.jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'audit_nested_payload';
  end if;
  for k, v in select * from pg_catalog.jsonb_each(p_input)
  loop
    lowered := pg_catalog.lower(k);
    if lowered in (
      'api_key',
      'audio',
      'auth_token',
      'bank',
      'card_number',
      'chat_text',
      'coordinates',
      'credential',
      'cvv',
      'database_url',
      'gps',
      'image',
      'latitude',
      'longitude',
      'password',
      'prompt',
      'response',
      'secret',
      'service_role',
      'token',
      'transcript'
    )
       or lowered like '%password%'
       or lowered like '%api_key%'
       or lowered like '%auth_token%'
       or lowered like '%service_role%'
       or lowered like '%database_url%'
       or lowered like '%card_number%'
       or lowered like '%cvv%'
       or lowered like '%prompt%'
       or lowered like '%transcript%'
       or lowered like '%chat_text%'
       or lowered like '%coordinates%'
       or lowered like '%credential%'
       or lowered like '%secret%'
    then
      raise exception 'audit_sensitive_field';
    end if;
    if pg_catalog.jsonb_typeof(v) in ('object', 'array') then
      raise exception 'audit_nested_payload';
    end if;
  end loop;
  foreach k in array array[
    'permission',
    'status',
    'target_id',
    'target_type',
    'user_id',
    'feature_id',
    'mode',
    'reason_code',
    'provider_id',
    'threshold_id',
    'scope',
    'period',
    'limit_mode',
    'currency',
    'plan_id',
    'field'
  ]
  loop
    if p_input ? k and pg_catalog.jsonb_typeof(p_input -> k) = 'string' then
      val := p_input ->> k;
      if pg_catalog.char_length(val) > 120 then
        raise exception 'audit_payload_too_large';
      end if;
      copied := copied || pg_catalog.jsonb_build_object(k, val);
    end if;
  end loop;
  if p_input ? 'version' and pg_catalog.jsonb_typeof(p_input -> 'version') = 'number' then
    ver := (p_input ->> 'version')::integer;
    if ver >= 1 then
      copied := copied || pg_catalog.jsonb_build_object('version', ver);
    end if;
  end if;
  if p_input ? 'display_order' and pg_catalog.jsonb_typeof(p_input -> 'display_order') = 'number' then
    display_order := (p_input ->> 'display_order')::integer;
    if display_order between 1 and 14 and (p_input ->> 'display_order') !~ '\.' then
      copied := copied || pg_catalog.jsonb_build_object('display_order', display_order);
    end if;
  end if;
  if p_input ? 'amount_minor' and pg_catalog.jsonb_typeof(p_input -> 'amount_minor') = 'number' then
    amount := (p_input ->> 'amount_minor')::bigint;
    if amount >= 0 and amount <= 9007199254740991 and (p_input ->> 'amount_minor') !~ '\.' then
      copied := copied || pg_catalog.jsonb_build_object('amount_minor', amount);
    end if;
  end if;
  if p_input ? 'enabled' and pg_catalog.jsonb_typeof(p_input -> 'enabled') = 'boolean' then
    copied := copied || pg_catalog.jsonb_build_object('enabled', (p_input ->> 'enabled')::boolean);
  end if;
  if p_input ? 'enabled_for_sale' and pg_catalog.jsonb_typeof(p_input -> 'enabled_for_sale') = 'boolean' then
    copied := copied || pg_catalog.jsonb_build_object('enabled_for_sale', (p_input ->> 'enabled_for_sale')::boolean);
  end if;
  if pg_catalog.octet_length(copied::text) > 2048 then
    raise exception 'audit_payload_too_large';
  end if;
  return copied;
end;
$$;

create or replace function billing.append_admin_audit(
  p_admin_user_id uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_reason_code text,
  p_before jsonb default '{}'::jsonb,
  p_after jsonb default '{}'::jsonb
)
returns billing.admin_audit
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  written billing.admin_audit;
begin
  if p_admin_user_id is null then
    raise exception 'invalid_admin_user_id';
  end if;
  if p_action not in (
    'permission.grant',
    'permission.revoke',
    'feature.control.created',
    'feature.control.changed',
    'provider.control.created',
    'provider.control.changed',
    'cost.threshold.created',
    'cost.threshold.changed',
    'plan.commercial.changed'
  ) then
    raise exception 'invalid_audit_action';
  end if;
  if p_target_type not in ('admin_permission', 'feature_control', 'provider_control', 'cost_threshold', 'plan_commercial') then
    raise exception 'invalid_target_type';
  end if;
  if p_target_id is null or p_target_id !~ '^[A-Za-z0-9._-]+$' or char_length(p_target_id) > 80 then
    raise exception 'invalid_target_id';
  end if;
  if p_action in ('permission.grant', 'permission.revoke') and p_target_type is distinct from 'admin_permission' then
    raise exception 'invalid_target_type';
  end if;
  if p_action in ('feature.control.created', 'feature.control.changed') and p_target_type is distinct from 'feature_control' then
    raise exception 'invalid_target_type';
  end if;
  if p_action in ('provider.control.created', 'provider.control.changed') and p_target_type is distinct from 'provider_control' then
    raise exception 'invalid_target_type';
  end if;
  if p_action in ('cost.threshold.created', 'cost.threshold.changed') and p_target_type is distinct from 'cost_threshold' then
    raise exception 'invalid_target_type';
  end if;
  if p_action = 'plan.commercial.changed' and p_target_type is distinct from 'plan_commercial' then
    raise exception 'invalid_target_type';
  end if;
  insert into billing.admin_audit (
    action,
    admin_user_id,
    after_safe,
    before_safe,
    reason_code,
    target_id,
    target_type
  ) values (
    p_action,
    p_admin_user_id,
    billing.admin_audit_snapshot(p_after),
    billing.admin_audit_snapshot(p_before),
    p_reason_code,
    p_target_id,
    p_target_type
  )
  returning * into written;
  return written;
end;
$$;

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
    select pg_catalog.coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'display_order', pg_catalog.coalesce(stored.display_order, catalog.display_order),
        'enabled_for_sale', pg_catalog.coalesce(stored.enabled_for_sale, false),
        'featured', false,
        'plan_id', catalog.plan_id,
        'version', pg_catalog.coalesce(stored.version, 0)
      )
      order by pg_catalog.coalesce(stored.display_order, catalog.display_order)
    ), '[]'::jsonb)
    from billing.paid_candidate_plans() catalog
    left join billing.plan_commercial_controls stored on stored.plan_id = catalog.plan_id
  );
end;
$$;

create or replace function billing.set_plan_commercial_availability(
  p_actor_user_id uuid,
  p_plan_id text,
  p_enabled_for_sale boolean,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing billing.plan_commercial_controls;
  catalog_order integer;
  next_version integer;
  next_order integer;
begin
  if p_actor_user_id is null or not billing.has_billing_admin(p_actor_user_id) then
    raise exception 'forbidden_admin';
  end if;
  if p_plan_id = 'plan.free' then
    raise exception 'protected_plan';
  end if;
  select catalog.display_order into catalog_order
  from billing.paid_candidate_plans() catalog
  where catalog.plan_id = p_plan_id;
  if catalog_order is null then
    raise exception 'unknown_plan';
  end if;
  if p_enabled_for_sale is null or p_expected_version is null or p_expected_version < 0 then
    raise exception 'invalid_plan_control';
  end if;
  select * into existing
  from billing.plan_commercial_controls
  where plan_id = p_plan_id
  for update;
  if existing.plan_id is null then
    if p_expected_version <> 0 then
      raise exception 'CONFIG_CONFLICT';
    end if;
    next_version := 1;
    next_order := catalog_order;
    insert into billing.plan_commercial_controls (
      display_order,
      enabled_for_sale,
      featured,
      plan_id,
      updated_by,
      version
    ) values (
      next_order,
      p_enabled_for_sale,
      false,
      p_plan_id,
      p_actor_user_id,
      next_version
    );
  else
    if existing.version <> p_expected_version then
      raise exception 'CONFIG_CONFLICT';
    end if;
    next_version := existing.version + 1;
    next_order := existing.display_order;
    update billing.plan_commercial_controls
    set enabled_for_sale = p_enabled_for_sale,
        featured = false,
        updated_at = pg_catalog.now(),
        updated_by = p_actor_user_id,
        version = next_version
    where plan_id = p_plan_id
      and version = p_expected_version;
  end if;
  perform billing.append_admin_audit(
    p_actor_user_id,
    'plan.commercial.changed',
    'plan_commercial',
    p_plan_id,
    'MANUAL_ADMIN',
    pg_catalog.jsonb_build_object(
      'display_order', case when existing.plan_id is null then catalog_order else existing.display_order end,
      'enabled_for_sale', case when existing.plan_id is null then false else existing.enabled_for_sale end,
      'field', 'enabled_for_sale',
      'plan_id', p_plan_id,
      'version', case when existing.plan_id is null then null else existing.version end
    ),
    pg_catalog.jsonb_build_object(
      'display_order', next_order,
      'enabled_for_sale', p_enabled_for_sale,
      'field', 'enabled_for_sale',
      'plan_id', p_plan_id,
      'version', next_version
    )
  );
  return billing.list_plan_commercial_controls(p_actor_user_id);
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
    pg_catalog.coalesce(stored.display_order, catalog.display_order),
    pg_catalog.coalesce(stored.enabled_for_sale, false),
    pg_catalog.coalesce(stored.version, 0)
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
      pg_catalog.coalesce(stored.display_order, catalog.display_order) as display_order,
      pg_catalog.coalesce(stored.enabled_for_sale, false) as enabled_for_sale,
      pg_catalog.coalesce(stored.version, 0) as version
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

revoke all on function billing.paid_candidate_plans() from public, anon, authenticated, service_role;
revoke all on function billing.guard_plan_commercial_row() from public, anon, authenticated, service_role;
revoke all on function billing.list_plan_commercial_controls(uuid) from public, anon, authenticated, service_role;
revoke all on function billing.set_plan_commercial_availability(uuid, text, boolean, integer) from public, anon, authenticated, service_role;
revoke all on function billing.move_plan_commercial_order(uuid, text, text, integer) from public, anon, authenticated, service_role;
grant execute on function billing.list_plan_commercial_controls(uuid) to service_role;
grant execute on function billing.set_plan_commercial_availability(uuid, text, boolean, integer) to service_role;
grant execute on function billing.move_plan_commercial_order(uuid, text, text, integer) to service_role;
