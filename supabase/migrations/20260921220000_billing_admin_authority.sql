-- BILL-4A billing admin authority, permissions, and audit foundation.
-- DO NOT apply to staging.
-- DO NOT apply to production. Local schema only until a later isolated review.
-- Does not ALTER billing.usage_events, quota, or subscription tables.
-- Does not add feature kill switches, cost limits, dashboards, or payment.
--
-- Bootstrap: first billing_admin is NOT granted by this file, the app,
-- localStorage, a frontend email, or a client flag. A trusted database
-- owner session (postgres / BYPASSRLS) may insert one ACTIVE row into
-- billing.admin_permissions. Do not run that bootstrap in BILL-4A.
--
-- Roles:
--   public / anon / authenticated: no table privileges, FORCE RLS deny-all.
--   service_role: SELECT on both tables; EXECUTE on has/grant/revoke only.
-- Direct INSERT/UPDATE/DELETE is revoked from clients and service_role.
-- Mutations go through SECURITY DEFINER helpers. Actor identity is the
-- UUID passed by trusted server code after JWT verification, never
-- auth.uid() from a spoofable client JWT on PostgREST.

create schema if not exists billing;

revoke all on schema billing from public, anon, authenticated;
grant usage on schema billing to service_role;

create table if not exists billing.admin_permissions (
  permission_id text primary key default (pg_catalog.gen_random_uuid()::text),
  user_id uuid not null,
  permission text not null,
  status text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint admin_permissions_id_len check (char_length(permission_id) between 1 and 80),
  constraint admin_permissions_known check (permission = 'billing_admin'),
  constraint admin_permissions_status_known check (status in ('ACTIVE', 'REVOKED'))
);

create unique index if not exists admin_permissions_user_permission_uidx
  on billing.admin_permissions (user_id, permission);

create index if not exists admin_permissions_user_active_idx
  on billing.admin_permissions (user_id)
  where status = 'ACTIVE';

create table if not exists billing.admin_audit (
  audit_id text primary key default (pg_catalog.gen_random_uuid()::text),
  admin_user_id uuid not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  reason_code text not null,
  before_safe jsonb not null default '{}'::jsonb,
  after_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  constraint admin_audit_id_len check (char_length(audit_id) between 1 and 80),
  constraint admin_audit_action_len check (char_length(action) between 1 and 80),
  constraint admin_audit_target_type_len check (char_length(target_type) between 1 and 40),
  constraint admin_audit_target_id_len check (char_length(target_id) between 1 and 80),
  constraint admin_audit_reason_known check (reason_code in (
    'MAINTENANCE',
    'COST_CONTROL',
    'PROVIDER_OUTAGE',
    'SECURITY',
    'MANUAL_ADMIN'
  ))
);

create index if not exists admin_audit_created_idx
  on billing.admin_audit (created_at desc);

create index if not exists admin_audit_admin_idx
  on billing.admin_audit (admin_user_id, created_at desc);

create index if not exists admin_audit_action_idx
  on billing.admin_audit (action, created_at desc);

alter table billing.admin_permissions enable row level security;
alter table billing.admin_permissions force row level security;
alter table billing.admin_audit enable row level security;
alter table billing.admin_audit force row level security;

drop policy if exists admin_permissions_deny_all on billing.admin_permissions;
create policy admin_permissions_deny_all
on billing.admin_permissions
as restrictive
for all
to public
using (false)
with check (false);

drop policy if exists admin_audit_deny_all on billing.admin_audit;
create policy admin_audit_deny_all
on billing.admin_audit
as restrictive
for all
to public
using (false)
with check (false);

revoke all on table billing.admin_permissions from public, anon, authenticated, service_role;
revoke all on table billing.admin_audit from public, anon, authenticated, service_role;
grant select on table billing.admin_permissions to service_role;
grant select on table billing.admin_audit to service_role;

create or replace function billing.guard_admin_permission_row()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'admin_permissions are not deletable';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := pg_catalog.now();
    new.updated_at := pg_catalog.now();
    return new;
  end if;
  if new.permission_id is distinct from old.permission_id
     or new.user_id is distinct from old.user_id
     or new.permission is distinct from old.permission
     or new.created_at is distinct from old.created_at then
    raise exception 'admin permission identity is immutable';
  end if;
  if old.status = new.status then
    new.updated_at := old.updated_at;
    return new;
  end if;
  if not (
    (old.status = 'ACTIVE' and new.status = 'REVOKED')
    or (old.status = 'REVOKED' and new.status = 'ACTIVE')
  ) then
    raise exception 'illegal permission status change';
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists admin_permissions_guard on billing.admin_permissions;
create trigger admin_permissions_guard
before insert or update or delete on billing.admin_permissions
for each row execute function billing.guard_admin_permission_row();

create or replace function billing.guard_admin_audit_row()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'UPDATE' or tg_op = 'DELETE' then
    raise exception 'billing.admin_audit is append-only';
  end if;
  new.created_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists admin_audit_guard on billing.admin_audit;
create trigger admin_audit_guard
before insert or update or delete on billing.admin_audit
for each row execute function billing.guard_admin_audit_row();

create or replace function billing.admin_audit_snapshot(p_input jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  k text;
begin
  if p_input is null then
    return '{}'::jsonb;
  end if;
  for k in select pg_catalog.jsonb_object_keys(p_input)
  loop
    if k in (
      'api_key',
      'audio',
      'card_number',
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
      'token'
    ) then
      raise exception 'audit_sensitive_field';
    end if;
  end loop;
  return pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'permission', p_input ->> 'permission',
    'status', p_input ->> 'status',
    'target_id', p_input ->> 'target_id',
    'target_type', p_input ->> 'target_type',
    'user_id', p_input ->> 'user_id'
  ));
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

create or replace function billing.has_billing_admin(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_user_id is null then
    return false;
  end if;
  return exists (
    select 1
    from billing.admin_permissions p
    where p.user_id = p_user_id
      and p.permission = 'billing_admin'
      and p.status = 'ACTIVE'
  );
end;
$$;

create or replace function billing.grant_billing_admin(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_reason_code text default 'MANUAL_ADMIN'
)
returns billing.admin_permissions
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing billing.admin_permissions;
  next_row billing.admin_permissions;
begin
  if p_actor_user_id is null or p_target_user_id is null then
    raise exception 'invalid_user_id';
  end if;
  if not billing.has_billing_admin(p_actor_user_id) then
    raise exception 'forbidden_admin';
  end if;

  select * into existing
  from billing.admin_permissions
  where user_id = p_target_user_id
    and permission = 'billing_admin'
  for update;

  if existing.permission_id is null then
    begin
      insert into billing.admin_permissions (permission, status, user_id)
      values ('billing_admin', 'ACTIVE', p_target_user_id)
      returning * into next_row;
    exception
      when unique_violation then
        select * into next_row
        from billing.admin_permissions
        where user_id = p_target_user_id
          and permission = 'billing_admin';
        if next_row.status = 'ACTIVE' then
          return next_row;
        end if;
        update billing.admin_permissions
        set status = 'ACTIVE'
        where permission_id = next_row.permission_id
        returning * into next_row;
    end;
  elsif existing.status = 'ACTIVE' then
    return existing;
  else
    update billing.admin_permissions
    set status = 'ACTIVE'
    where permission_id = existing.permission_id
    returning * into next_row;
  end if;

  perform billing.append_admin_audit(
    p_actor_user_id,
    'permission.grant',
    'admin_permission',
    p_target_user_id::text,
    p_reason_code,
    to_jsonb(existing),
    to_jsonb(next_row)
  );
  return next_row;
end;
$$;

create or replace function billing.revoke_billing_admin(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_reason_code text default 'SECURITY'
)
returns billing.admin_permissions
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing billing.admin_permissions;
  next_row billing.admin_permissions;
begin
  if p_actor_user_id is null or p_target_user_id is null then
    raise exception 'invalid_user_id';
  end if;
  if not billing.has_billing_admin(p_actor_user_id) then
    raise exception 'forbidden_admin';
  end if;

  select * into existing
  from billing.admin_permissions
  where user_id = p_target_user_id
    and permission = 'billing_admin'
  for update;

  if existing.permission_id is null or existing.status is distinct from 'ACTIVE' then
    raise exception 'permission_not_active';
  end if;

  update billing.admin_permissions
  set status = 'REVOKED'
  where permission_id = existing.permission_id
  returning * into next_row;

  perform billing.append_admin_audit(
    p_actor_user_id,
    'permission.revoke',
    'admin_permission',
    p_target_user_id::text,
    p_reason_code,
    to_jsonb(existing),
    to_jsonb(next_row)
  );
  return next_row;
end;
$$;

revoke all on function billing.admin_audit_snapshot(jsonb) from public, anon, authenticated, service_role;
revoke all on function billing.append_admin_audit(uuid, text, text, text, text, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function billing.has_billing_admin(uuid) from public, anon, authenticated, service_role;
revoke all on function billing.grant_billing_admin(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function billing.revoke_billing_admin(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function billing.guard_admin_permission_row() from public, anon, authenticated, service_role;
revoke all on function billing.guard_admin_audit_row() from public, anon, authenticated, service_role;

grant execute on function billing.has_billing_admin(uuid) to service_role;
grant execute on function billing.grant_billing_admin(uuid, uuid, text) to service_role;
grant execute on function billing.revoke_billing_admin(uuid, uuid, text) to service_role;
