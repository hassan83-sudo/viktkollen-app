-- BILL-4C1b cost-threshold persistence. DO NOT apply to staging.
-- DO NOT apply to production. Local schema only until a later isolated review.
-- Extends BILL-4A audit allowlists for cost-threshold mutations.
-- Does not ALTER usage, quota, subscription, feature_control, or provider_control tables.
-- Does not aggregate usage events. Does not create billing_admin.

create schema if not exists billing;

revoke all on schema billing from public, anon, authenticated;
grant usage on schema billing to service_role;

create table if not exists billing.cost_thresholds (
  threshold_id uuid primary key default pg_catalog.gen_random_uuid(),
  scope text not null,
  feature_id text,
  period text not null,
  limit_mode text not null,
  amount_minor bigint not null,
  currency text not null,
  enabled boolean not null default true,
  version integer not null,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid not null,
  constraint cost_thresholds_scope_known check (scope in ('GLOBAL', 'FEATURE')),
  constraint cost_thresholds_period_known check (period in ('DAILY', 'MONTHLY')),
  constraint cost_thresholds_mode_known check (limit_mode in ('SOFT_ALERT', 'HARD_STOP')),
  constraint cost_thresholds_currency_sek check (currency = 'SEK'),
  constraint cost_thresholds_amount_non_negative check (amount_minor >= 0),
  constraint cost_thresholds_amount_safe_integer check (amount_minor <= 9007199254740991),
  constraint cost_thresholds_version_positive check (version >= 1),
  constraint cost_thresholds_global_feature_null check (
    (scope = 'GLOBAL' and feature_id is null)
    or (scope = 'FEATURE' and feature_id is not null)
  ),
  constraint cost_thresholds_feature_known check (
    feature_id is null
    or feature_id in (
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
    )
  )
);

create unique index if not exists cost_thresholds_identity_uidx
  on billing.cost_thresholds (scope, coalesce(feature_id, ''), period, limit_mode);

create index if not exists cost_thresholds_active_lookup_idx
  on billing.cost_thresholds (enabled, scope, period, limit_mode)
  where enabled = true;

create index if not exists cost_thresholds_active_feature_idx
  on billing.cost_thresholds (enabled, scope, feature_id, period, limit_mode)
  where enabled = true and feature_id is not null;

alter table billing.admin_audit drop constraint if exists admin_audit_action_known;
alter table billing.admin_audit add constraint admin_audit_action_known check (action in (
  'permission.grant',
  'permission.revoke',
  'feature.control.created',
  'feature.control.changed',
  'provider.control.created',
  'provider.control.changed',
  'cost.threshold.created',
  'cost.threshold.changed'
));

alter table billing.admin_audit drop constraint if exists admin_audit_target_type_known;
alter table billing.admin_audit add constraint admin_audit_target_type_known check (target_type in (
  'admin_permission',
  'feature_control',
  'provider_control',
  'cost_threshold'
));

alter table billing.cost_thresholds enable row level security;
alter table billing.cost_thresholds force row level security;

drop policy if exists cost_thresholds_deny_all on billing.cost_thresholds;
create policy cost_thresholds_deny_all
on billing.cost_thresholds
as restrictive
for all
to public
using (false)
with check (false);

revoke all on table billing.cost_thresholds from public, anon, authenticated, service_role;
grant select on table billing.cost_thresholds to service_role;

create or replace function billing.guard_cost_threshold_row()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'cost_thresholds are not deletable';
  end if;
  if tg_op = 'INSERT' then
    if new.version is distinct from 1 then
      raise exception 'initial cost threshold version must be 1';
    end if;
    new.updated_at := pg_catalog.now();
    return new;
  end if;
  if new.threshold_id is distinct from old.threshold_id then
    raise exception 'threshold_id is immutable';
  end if;
  if new.scope is distinct from old.scope
     or new.feature_id is distinct from old.feature_id
     or new.period is distinct from old.period
     or new.limit_mode is distinct from old.limit_mode
     or new.currency is distinct from old.currency then
    raise exception 'cost threshold identity is immutable';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'cost threshold version must increase by 1';
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists cost_thresholds_guard on billing.cost_thresholds;
create trigger cost_thresholds_guard
before insert or update or delete on billing.cost_thresholds
for each row execute function billing.guard_cost_threshold_row();

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
    'currency'
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
  if p_input ? 'amount_minor' and pg_catalog.jsonb_typeof(p_input -> 'amount_minor') = 'number' then
    amount := (p_input ->> 'amount_minor')::bigint;
    if amount >= 0 and amount <= 9007199254740991 and (p_input ->> 'amount_minor') !~ '\.' then
      copied := copied || pg_catalog.jsonb_build_object('amount_minor', amount);
    end if;
  end if;
  if p_input ? 'enabled' and pg_catalog.jsonb_typeof(p_input -> 'enabled') = 'boolean' then
    copied := copied || pg_catalog.jsonb_build_object('enabled', (p_input ->> 'enabled')::boolean);
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
    'cost.threshold.changed'
  ) then
    raise exception 'invalid_audit_action';
  end if;
  if p_target_type not in ('admin_permission', 'feature_control', 'provider_control', 'cost_threshold') then
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

create or replace function billing.cost_threshold_audit_payload(p_row billing.cost_thresholds)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
begin
  return pg_catalog.jsonb_build_object(
    'amount_minor', p_row.amount_minor,
    'currency', p_row.currency,
    'enabled', p_row.enabled,
    'feature_id', p_row.feature_id,
    'limit_mode', p_row.limit_mode,
    'period', p_row.period,
    'scope', p_row.scope,
    'threshold_id', p_row.threshold_id::text,
    'version', p_row.version
  );
end;
$$;

create or replace function billing.create_cost_threshold(
  p_actor_user_id uuid,
  p_scope text,
  p_feature_id text,
  p_period text,
  p_limit_mode text,
  p_amount_minor bigint,
  p_currency text,
  p_enabled boolean
)
returns billing.cost_thresholds
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  next_row billing.cost_thresholds;
  feature_value text;
begin
  if p_actor_user_id is null then
    raise exception 'invalid_user_id';
  end if;
  if not billing.has_billing_admin(p_actor_user_id) then
    raise exception 'forbidden_admin';
  end if;
  if p_scope not in ('GLOBAL', 'FEATURE') then
    raise exception 'invalid_cost_scope';
  end if;
  if p_period not in ('DAILY', 'MONTHLY') then
    raise exception 'invalid_cost_period';
  end if;
  if p_limit_mode not in ('SOFT_ALERT', 'HARD_STOP') then
    raise exception 'invalid_limit_mode';
  end if;
  if p_currency is distinct from 'SEK' then
    raise exception 'invalid_cost_currency';
  end if;
  if p_amount_minor is null or p_amount_minor < 0 or p_amount_minor > 9007199254740991 then
    raise exception 'invalid_cost_threshold';
  end if;
  if p_enabled is null then
    raise exception 'invalid_cost_enabled';
  end if;
  if p_scope = 'GLOBAL' then
    if p_feature_id is not null then
      raise exception 'invalid_cost_scope';
    end if;
    feature_value := null;
  else
    if p_feature_id not in (
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
    ) then
      raise exception 'unknown_feature';
    end if;
    feature_value := p_feature_id;
  end if;

  begin
    insert into billing.cost_thresholds (
      amount_minor,
      currency,
      enabled,
      feature_id,
      limit_mode,
      period,
      scope,
      updated_by,
      version
    ) values (
      p_amount_minor,
      'SEK',
      p_enabled,
      feature_value,
      p_limit_mode,
      p_period,
      p_scope,
      p_actor_user_id,
      1
    )
    returning * into next_row;
  exception
    when unique_violation then
      raise exception 'CONFIG_CONFLICT';
  end;

  perform billing.append_admin_audit(
    p_actor_user_id,
    'cost.threshold.created',
    'cost_threshold',
    next_row.threshold_id::text,
    'MANUAL_ADMIN',
    '{}'::jsonb,
    billing.cost_threshold_audit_payload(next_row)
  );
  return next_row;
end;
$$;

create or replace function billing.update_cost_threshold(
  p_actor_user_id uuid,
  p_threshold_id uuid,
  p_expected_version integer,
  p_amount_minor bigint,
  p_enabled boolean
)
returns billing.cost_thresholds
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing billing.cost_thresholds;
  next_row billing.cost_thresholds;
begin
  if p_actor_user_id is null then
    raise exception 'invalid_user_id';
  end if;
  if not billing.has_billing_admin(p_actor_user_id) then
    raise exception 'forbidden_admin';
  end if;
  if p_threshold_id is null then
    raise exception 'invalid_threshold_id';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'invalid_cost_version';
  end if;
  if p_amount_minor is null or p_amount_minor < 0 or p_amount_minor > 9007199254740991 then
    raise exception 'invalid_cost_threshold';
  end if;
  if p_enabled is null then
    raise exception 'invalid_cost_enabled';
  end if;

  select * into existing
  from billing.cost_thresholds
  where threshold_id = p_threshold_id
  for update;

  if existing.threshold_id is null then
    raise exception 'CONFIG_CONFLICT';
  end if;
  if existing.version is distinct from p_expected_version then
    raise exception 'CONFIG_CONFLICT';
  end if;

  update billing.cost_thresholds
  set
    amount_minor = p_amount_minor,
    enabled = p_enabled,
    updated_by = p_actor_user_id,
    version = existing.version + 1
  where threshold_id = p_threshold_id
    and version = p_expected_version
  returning * into next_row;

  if next_row.threshold_id is null then
    raise exception 'CONFIG_CONFLICT';
  end if;

  perform billing.append_admin_audit(
    p_actor_user_id,
    'cost.threshold.changed',
    'cost_threshold',
    next_row.threshold_id::text,
    'MANUAL_ADMIN',
    billing.cost_threshold_audit_payload(existing),
    billing.cost_threshold_audit_payload(next_row)
  );
  return next_row;
end;
$$;

revoke all on function billing.guard_cost_threshold_row() from public, anon, authenticated, service_role;
revoke all on function billing.cost_threshold_audit_payload(billing.cost_thresholds) from public, anon, authenticated, service_role;
revoke all on function billing.create_cost_threshold(uuid, text, text, text, text, bigint, text, boolean) from public, anon, authenticated, service_role;
revoke all on function billing.update_cost_threshold(uuid, uuid, integer, bigint, boolean) from public, anon, authenticated, service_role;
grant execute on function billing.create_cost_threshold(uuid, text, text, text, text, bigint, text, boolean) to service_role;
grant execute on function billing.update_cost_threshold(uuid, uuid, integer, bigint, boolean) to service_role;
revoke all on function billing.append_admin_audit(uuid, text, text, text, text, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function billing.admin_audit_snapshot(jsonb) from public, anon, authenticated, service_role;
