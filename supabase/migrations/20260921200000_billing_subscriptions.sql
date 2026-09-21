-- BILL-3 subscription state foundation. DO NOT apply to staging.
-- DO NOT apply to production. Local schema only until a later isolated review.
-- Structure only. Payment processors and card data are out of scope.
-- Does not ALTER billing.usage_events or quota reservation tables.
-- Does not seed trials or paid rows. No user loses access from this file.

create schema if not exists billing;

revoke all on schema billing from public, anon, authenticated;
grant usage on schema billing to service_role;

create table if not exists billing.subscriptions (
  subscription_id text primary key default (pg_catalog.gen_random_uuid()::text),
  user_id uuid not null,
  plan_id text not null references billing.plans (plan_id),
  plan_version integer not null,
  status text not null,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  pending_plan_id text references billing.plans (plan_id),
  pending_plan_change text,
  past_due_grace_until timestamptz,
  provider text not null default '',
  provider_customer_ref text not null default '',
  provider_subscription_ref text not null default '',
  external_event_id text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint subscriptions_id_len check (char_length(subscription_id) between 1 and 80),
  constraint subscriptions_status_known check (status in (
    'TRIALING',
    'ACTIVE',
    'PAST_DUE',
    'PAUSED',
    'CANCELED',
    'EXPIRED'
  )),
  constraint subscriptions_period_forward check (current_period_end > current_period_start),
  constraint subscriptions_version_positive check (plan_version >= 1),
  constraint subscriptions_pending_when_known check (
    pending_plan_change is null
    or pending_plan_change in ('now', 'next_period')
  ),
  constraint subscriptions_pending_pair check (
    (pending_plan_id is null and pending_plan_change is null)
    or (pending_plan_id is not null and pending_plan_change is not null)
  ),
  constraint subscriptions_provider_len check (char_length(provider) <= 40),
  constraint subscriptions_provider_customer_len check (char_length(provider_customer_ref) <= 120),
  constraint subscriptions_provider_sub_len check (char_length(provider_subscription_ref) <= 120),
  constraint subscriptions_event_len check (
    external_event_id is null or char_length(external_event_id) between 1 and 120
  )
);

create unique index if not exists subscriptions_external_event_uidx
  on billing.subscriptions (external_event_id)
  where external_event_id is not null;

create unique index if not exists subscriptions_one_open_per_user_uidx
  on billing.subscriptions (user_id)
  where status in ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED');

create index if not exists subscriptions_user_idx
  on billing.subscriptions (user_id, current_period_end desc);

create or replace function billing.subscription_transition_allowed(from_status text, to_status text)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select
    from_status = to_status
    or (from_status = 'TRIALING' and to_status in ('ACTIVE', 'CANCELED', 'EXPIRED', 'PAUSED'))
    or (from_status = 'ACTIVE' and to_status in ('CANCELED', 'EXPIRED', 'PAST_DUE', 'PAUSED'))
    or (from_status = 'PAST_DUE' and to_status in ('ACTIVE', 'CANCELED', 'EXPIRED'))
    or (from_status = 'PAUSED' and to_status in ('ACTIVE', 'CANCELED'))
$$;

create or replace function billing.guard_subscription_row()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  plan_active boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'subscriptions are not deletable';
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED') then
      raise exception 'insert status must be an open subscription state';
    end if;
    select p.active into plan_active from billing.plans p where p.plan_id = new.plan_id;
    if plan_active is distinct from true then
      raise exception 'new subscription requires an active plan';
    end if;
    new.created_at := pg_catalog.now();
    new.updated_at := pg_catalog.now();
    return new;
  end if;

  if new.subscription_id is distinct from old.subscription_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at
     or new.plan_id is distinct from old.plan_id
     or new.plan_version is distinct from old.plan_version then
    raise exception 'subscription identity and plan snapshot are immutable';
  end if;

  if old.external_event_id is not null
     and new.external_event_id is distinct from old.external_event_id then
    raise exception 'external_event_id is immutable once set';
  end if;

  if not billing.subscription_transition_allowed(old.status, new.status) then
    raise exception 'illegal subscription transition % -> %', old.status, new.status;
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists subscriptions_guard on billing.subscriptions;
create trigger subscriptions_guard
before insert or update or delete on billing.subscriptions
for each row execute function billing.guard_subscription_row();

revoke all on function billing.subscription_transition_allowed(text, text) from public, anon, authenticated;
revoke all on function billing.guard_subscription_row() from public, anon, authenticated;

alter table billing.subscriptions enable row level security;
alter table billing.subscriptions force row level security;

drop policy if exists subscriptions_deny_all on billing.subscriptions;
create policy subscriptions_deny_all
on billing.subscriptions
as restrictive
for all
to public
using (false)
with check (false);

revoke all privileges on table billing.subscriptions from public, anon, authenticated;
grant select, insert, update on table billing.subscriptions to service_role;
revoke delete on table billing.subscriptions from public, anon, authenticated, service_role;
