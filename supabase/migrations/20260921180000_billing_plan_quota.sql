-- BILL-2 plan assignment + quota reservations. DO NOT apply to production
-- without the same isolated staging review as BILL-1E.
-- Structure only. Payment providers are out of scope.
-- Does not ALTER billing.usage_events (BILL-1 live schema stays append-only).

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

create table if not exists billing.quota_reservations (
  reservation_id text primary key,
  user_id uuid not null,
  feature text not null,
  quantity integer not null,
  actual_quantity integer,
  overage_quantity integer not null default 0,
  unit text not null,
  status text not null,
  plan_id text not null,
  plan_version integer not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  committed_at timestamptz,
  rolled_back_at timestamptz,
  constraint quota_res_id_len check (char_length(reservation_id) between 1 and 180),
  constraint quota_res_feature_len check (char_length(feature) between 1 and 80),
  constraint quota_res_quantity_nonneg check (quantity >= 0 and quantity <= 1000000000),
  constraint quota_res_actual_nonneg check (
    actual_quantity is null
    or (actual_quantity >= 0 and actual_quantity <= 1000000000)
  ),
  constraint quota_res_overage_nonneg check (overage_quantity >= 0 and overage_quantity <= 1000000000),
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
  constraint quota_res_plan_version_positive check (plan_version >= 1)
);

create index if not exists quota_reservations_user_feature_period_idx
  on billing.quota_reservations (user_id, feature, period_start, status);

comment on table billing.plans is
  'BILL-2 plan catalog foundation. Prices are PRELIMINARY / ADMIN-CONFIGURABLE. No payment provider columns.';

comment on table billing.quota_reservations is
  'Quota reservations only. No prompts, audio, images, coordinates, chat, passwords, or payment data.';

comment on column billing.plan_entitlements.limit_kind is
  'NUMBER or UNLIMITED. Unlimited is an explicit limit_kind, never a magic integer.';

create or replace function billing.reject_quota_reservation_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
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
  return new;
end;
$$;

drop trigger if exists quota_reservations_immutable on billing.quota_reservations;
create trigger quota_reservations_immutable
before update on billing.quota_reservations
for each row
execute function billing.reject_quota_reservation_immutable();

revoke all on function billing.reject_quota_reservation_immutable() from public, anon, authenticated;

alter table billing.plans enable row level security;
alter table billing.plans force row level security;
alter table billing.plan_entitlements enable row level security;
alter table billing.plan_entitlements force row level security;
alter table billing.user_plan_assignments enable row level security;
alter table billing.user_plan_assignments force row level security;
alter table billing.quota_reservations enable row level security;
alter table billing.quota_reservations force row level security;

revoke all privileges on table billing.plans from public, anon, authenticated;
revoke all privileges on table billing.plan_entitlements from public, anon, authenticated;
revoke all privileges on table billing.user_plan_assignments from public, anon, authenticated;
revoke all privileges on table billing.quota_reservations from public, anon, authenticated;

grant select, insert, update on table billing.plans to service_role;
grant select, insert, update on table billing.plan_entitlements to service_role;
grant select, insert, update on table billing.user_plan_assignments to service_role;
grant select, insert, update on table billing.quota_reservations to service_role;

revoke delete on table billing.plans from public, anon, authenticated, service_role;
revoke delete on table billing.plan_entitlements from public, anon, authenticated, service_role;
revoke delete on table billing.user_plan_assignments from public, anon, authenticated, service_role;
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

drop policy if exists "No direct client access to quota reservations" on billing.quota_reservations;
create policy "No direct client access to quota reservations"
on billing.quota_reservations as restrictive for all to public using (false) with check (false);
