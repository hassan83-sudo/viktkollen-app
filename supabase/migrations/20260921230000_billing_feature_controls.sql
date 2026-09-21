-- BILL-4B feature + provider control persistence. DO NOT apply to staging.
-- DO NOT apply to production. Local schema only until a later isolated review.
-- BILL-4B2b extends this unapplied BILL-4B1b file (strategy A): same apply later.
-- Extends BILL-4A audit allowlists for feature-control and provider-control mutations.
-- Does not ALTER usage, quota, or subscription tables.
-- Does not seed control rows (known features/providers keep 4B1a/4B2a defaults).
-- Does not create billing_admin.

create schema if not exists billing;

revoke all on schema billing from public, anon, authenticated;
grant usage on schema billing to service_role;

create table if not exists billing.feature_controls (
  feature_id text primary key,
  mode text not null,
  reason_code text,
  version integer not null,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid not null,
  constraint feature_controls_id_known check (feature_id in (
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
  constraint feature_controls_mode_known check (mode in ('ENABLED', 'DISABLED', 'MAINTENANCE')),
  constraint feature_controls_reason_known check (
    reason_code is null
    or reason_code in ('MAINTENANCE', 'MANUAL_ADMIN', 'SECURITY')
  ),
  constraint feature_controls_reason_required check (
    mode = 'ENABLED' or reason_code is not null
  ),
  constraint feature_controls_version_positive check (version >= 1)
);

create unique index if not exists feature_controls_feature_id_uidx
  on billing.feature_controls (feature_id);

alter table billing.admin_audit drop constraint if exists admin_audit_action_known;
alter table billing.admin_audit add constraint admin_audit_action_known check (action in (
  'permission.grant',
  'permission.revoke',
  'feature.control.created',
  'feature.control.changed',
  'provider.control.created',
  'provider.control.changed'
));

alter table billing.admin_audit drop constraint if exists admin_audit_target_type_known;
alter table billing.admin_audit add constraint admin_audit_target_type_known check (target_type in (
  'admin_permission',
  'feature_control',
  'provider_control'
));

alter table billing.admin_audit drop constraint if exists admin_audit_target_id_uuid;
alter table billing.admin_audit add constraint admin_audit_target_id_token check (
  char_length(target_id) between 1 and 80
  and target_id ~ '^[A-Za-z0-9._-]+$'
);

alter table billing.feature_controls enable row level security;
alter table billing.feature_controls force row level security;

drop policy if exists feature_controls_deny_all on billing.feature_controls;
create policy feature_controls_deny_all
on billing.feature_controls
as restrictive
for all
to public
using (false)
with check (false);

revoke all on table billing.feature_controls from public, anon, authenticated, service_role;
grant select on table billing.feature_controls to service_role;

create or replace function billing.guard_feature_control_row()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'feature_controls are not deletable';
  end if;
  if tg_op = 'INSERT' then
    if new.version is distinct from 1 then
      raise exception 'initial feature control version must be 1';
    end if;
    new.updated_at := pg_catalog.now();
    return new;
  end if;
  if new.feature_id is distinct from old.feature_id then
    raise exception 'feature_id is immutable';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'feature control version must increase by 1';
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists feature_controls_guard on billing.feature_controls;
create trigger feature_controls_guard
before insert or update or delete on billing.feature_controls
for each row execute function billing.guard_feature_control_row();

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
      'cvv',
      'database_url',
      'image',
      'latitude',
      'longitude',
      'password',
      'prompt',
      'response',
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
    then
      raise exception 'audit_sensitive_field';
    end if;
    if pg_catalog.jsonb_typeof(v) in ('object', 'array') then
      raise exception 'audit_nested_payload';
    end if;
  end loop;
  foreach k in array array['permission', 'status', 'target_id', 'target_type', 'user_id', 'feature_id', 'mode', 'reason_code', 'provider_id']
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
    'provider.control.changed'
  ) then
    raise exception 'invalid_audit_action';
  end if;
  if p_target_type not in ('admin_permission', 'feature_control', 'provider_control') then
    raise exception 'invalid_target_type';
  end if;
  if p_target_id is null or p_target_id !~ '^[A-Za-z0-9._-]+$' or char_length(p_target_id) > 80 then
    raise exception 'invalid_target_id';
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

create or replace function billing.set_feature_control(
  p_actor_user_id uuid,
  p_feature_id text,
  p_mode text,
  p_reason_code text,
  p_expected_version integer
)
returns billing.feature_controls
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing billing.feature_controls;
  next_row billing.feature_controls;
  expected integer;
begin
  if p_actor_user_id is null then
    raise exception 'invalid_user_id';
  end if;
  if not billing.has_billing_admin(p_actor_user_id) then
    raise exception 'forbidden_admin';
  end if;
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
  expected := coalesce(p_expected_version, 0);
  if expected < 0 then
    raise exception 'invalid_feature_version';
  end if;

  select * into existing
  from billing.feature_controls
  where feature_id = p_feature_id
  for update;

  if existing.feature_id is null then
    if expected <> 0 then
      raise exception 'CONFIG_CONFLICT';
    end if;
    begin
      insert into billing.feature_controls (
        feature_id,
        mode,
        reason_code,
        updated_by,
        version
      ) values (
        p_feature_id,
        p_mode,
        p_reason_code,
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
      'feature.control.created',
      'feature_control',
      p_feature_id,
      coalesce(p_reason_code, 'MANUAL_ADMIN'),
      '{}'::jsonb,
      pg_catalog.jsonb_build_object(
        'feature_id', next_row.feature_id,
        'mode', next_row.mode,
        'reason_code', next_row.reason_code,
        'version', next_row.version
      )
    );
    return next_row;
  end if;

  if existing.version is distinct from expected then
    raise exception 'CONFIG_CONFLICT';
  end if;

  update billing.feature_controls
  set
    mode = p_mode,
    reason_code = p_reason_code,
    updated_by = p_actor_user_id,
    version = existing.version + 1
  where feature_id = p_feature_id
    and version = expected
  returning * into next_row;

  if next_row.feature_id is null then
    raise exception 'CONFIG_CONFLICT';
  end if;

  perform billing.append_admin_audit(
    p_actor_user_id,
    'feature.control.changed',
    'feature_control',
    p_feature_id,
    coalesce(p_reason_code, 'MANUAL_ADMIN'),
    pg_catalog.jsonb_build_object(
      'feature_id', existing.feature_id,
      'mode', existing.mode,
      'reason_code', existing.reason_code,
      'version', existing.version
    ),
    pg_catalog.jsonb_build_object(
      'feature_id', next_row.feature_id,
      'mode', next_row.mode,
      'reason_code', next_row.reason_code,
      'version', next_row.version
    )
  );
  return next_row;
end;
$$;

revoke all on function billing.guard_feature_control_row() from public, anon, authenticated, service_role;
revoke all on function billing.set_feature_control(uuid, text, text, text, integer) from public, anon, authenticated, service_role;
grant execute on function billing.set_feature_control(uuid, text, text, text, integer) to service_role;

create table if not exists billing.provider_controls (
  provider_id text primary key,
  mode text not null,
  reason_code text,
  version integer not null,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid not null,
  constraint provider_controls_id_known check (provider_id in (
    'openai',
    'google.cloud_run.ai_ear'
  )),
  constraint provider_controls_mode_known check (mode in ('AVAILABLE', 'UNAVAILABLE', 'MAINTENANCE')),
  constraint provider_controls_reason_known check (
    reason_code is null
    or reason_code in ('PROVIDER_OUTAGE', 'MAINTENANCE', 'SECURITY', 'MANUAL_ADMIN')
  ),
  constraint provider_controls_reason_required check (
    mode = 'AVAILABLE' or reason_code is not null
  ),
  constraint provider_controls_version_positive check (version >= 1)
);

create unique index if not exists provider_controls_provider_id_uidx
  on billing.provider_controls (provider_id);

alter table billing.provider_controls enable row level security;
alter table billing.provider_controls force row level security;

drop policy if exists provider_controls_deny_all on billing.provider_controls;
create policy provider_controls_deny_all
on billing.provider_controls
as restrictive
for all
to public
using (false)
with check (false);

revoke all on table billing.provider_controls from public, anon, authenticated, service_role;
grant select on table billing.provider_controls to service_role;

create or replace function billing.guard_provider_control_row()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'provider_controls are not deletable';
  end if;
  if tg_op = 'INSERT' then
    if new.version is distinct from 1 then
      raise exception 'initial provider control version must be 1';
    end if;
    new.updated_at := pg_catalog.now();
    return new;
  end if;
  if new.provider_id is distinct from old.provider_id then
    raise exception 'provider_id is immutable';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'provider control version must increase by 1';
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists provider_controls_guard on billing.provider_controls;
create trigger provider_controls_guard
before insert or update or delete on billing.provider_controls
for each row execute function billing.guard_provider_control_row();

create or replace function billing.set_provider_control(
  p_actor_user_id uuid,
  p_provider_id text,
  p_mode text,
  p_reason_code text,
  p_expected_version integer
)
returns billing.provider_controls
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing billing.provider_controls;
  next_row billing.provider_controls;
  expected integer;
begin
  if p_actor_user_id is null then
    raise exception 'invalid_user_id';
  end if;
  if not billing.has_billing_admin(p_actor_user_id) then
    raise exception 'forbidden_admin';
  end if;
  if p_provider_id not in (
    'openai',
    'google.cloud_run.ai_ear'
  ) then
    raise exception 'unknown_provider';
  end if;
  expected := coalesce(p_expected_version, 0);
  if expected < 0 then
    raise exception 'invalid_provider_version';
  end if;

  select * into existing
  from billing.provider_controls
  where provider_id = p_provider_id
  for update;

  if existing.provider_id is null then
    if expected <> 0 then
      raise exception 'CONFIG_CONFLICT';
    end if;
    begin
      insert into billing.provider_controls (
        provider_id,
        mode,
        reason_code,
        updated_by,
        version
      ) values (
        p_provider_id,
        p_mode,
        p_reason_code,
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
      'provider.control.created',
      'provider_control',
      p_provider_id,
      coalesce(p_reason_code, 'MANUAL_ADMIN'),
      '{}'::jsonb,
      pg_catalog.jsonb_build_object(
        'provider_id', next_row.provider_id,
        'mode', next_row.mode,
        'reason_code', next_row.reason_code,
        'version', next_row.version
      )
    );
    return next_row;
  end if;

  if existing.version is distinct from expected then
    raise exception 'CONFIG_CONFLICT';
  end if;

  update billing.provider_controls
  set
    mode = p_mode,
    reason_code = p_reason_code,
    updated_by = p_actor_user_id,
    version = existing.version + 1
  where provider_id = p_provider_id
    and version = expected
  returning * into next_row;

  if next_row.provider_id is null then
    raise exception 'CONFIG_CONFLICT';
  end if;

  perform billing.append_admin_audit(
    p_actor_user_id,
    'provider.control.changed',
    'provider_control',
    p_provider_id,
    coalesce(p_reason_code, 'MANUAL_ADMIN'),
    pg_catalog.jsonb_build_object(
      'provider_id', existing.provider_id,
      'mode', existing.mode,
      'reason_code', existing.reason_code,
      'version', existing.version
    ),
    pg_catalog.jsonb_build_object(
      'provider_id', next_row.provider_id,
      'mode', next_row.mode,
      'reason_code', next_row.reason_code,
      'version', next_row.version
    )
  );
  return next_row;
end;
$$;

revoke all on function billing.guard_provider_control_row() from public, anon, authenticated, service_role;
revoke all on function billing.set_provider_control(uuid, text, text, text, integer) from public, anon, authenticated, service_role;
grant execute on function billing.set_provider_control(uuid, text, text, text, integer) to service_role;
revoke all on function billing.append_admin_audit(uuid, text, text, text, text, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function billing.admin_audit_snapshot(jsonb) from public, anon, authenticated, service_role;
