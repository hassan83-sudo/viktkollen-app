-- BILL-3 subscription state foundation. DO NOT apply to staging.
-- DO NOT apply to production. Local schema only until a later isolated review.
-- Structure only. Payment processors and card data are out of scope.
-- Does not ALTER billing.usage_events or quota reservation tables.
-- Does not seed trials or paid rows. No user loses access from this file.
-- BILL-3A: mutations go through SECURITY DEFINER helpers. Direct table
-- INSERT/UPDATE is revoked from clients and from service_role.

create schema if not exists billing;

revoke all on schema billing from public, anon, authenticated;
grant usage on schema billing to service_role;

create table if not exists billing.subscriptions (
  subscription_id text primary key default (pg_catalog.gen_random_uuid()::text),
  user_id uuid not null,
  plan_id text not null references billing.plans (plan_id) on delete restrict on update restrict,
  plan_version integer not null,
  status text not null,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  pending_plan_id text references billing.plans (plan_id) on delete restrict on update restrict,
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
  constraint subscriptions_provider_token check (provider ~ '^[A-Za-z0-9._-]*$'),
  constraint subscriptions_provider_customer_token check (provider_customer_ref ~ '^[A-Za-z0-9._:-]*$'),
  constraint subscriptions_provider_sub_token check (provider_subscription_ref ~ '^[A-Za-z0-9._:-]*$'),
  constraint subscriptions_provider_len check (char_length(provider) <= 40),
  constraint subscriptions_provider_customer_len check (char_length(provider_customer_ref) <= 120),
  constraint subscriptions_provider_sub_len check (char_length(provider_subscription_ref) <= 120),
  constraint subscriptions_event_len check (
    external_event_id is null or char_length(external_event_id) between 1 and 120
  ),
  constraint subscriptions_event_token check (
    external_event_id is null or external_event_id ~ '^[A-Za-z0-9._:-]+$'
  ),
  constraint subscriptions_grace_only_past_due check (
    past_due_grace_until is null or status = 'PAST_DUE'
  )
);

create unique index if not exists subscriptions_one_open_per_user_uidx
  on billing.subscriptions (user_id)
  where status in ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED');
-- Open = TRIALING, ACTIVE, PAST_DUE, PAUSED. Terminal CANCELED/EXPIRED omitted.

create unique index if not exists subscriptions_provider_sub_uidx
  on billing.subscriptions (provider, provider_subscription_ref)
  where provider <> '' and provider_subscription_ref <> '';

create index if not exists subscriptions_user_idx
  on billing.subscriptions (user_id, current_period_end desc);

create index if not exists subscriptions_user_status_idx
  on billing.subscriptions (user_id, status);

create table if not exists billing.subscription_events (
  external_event_id text primary key,
  subscription_id text not null references billing.subscriptions (subscription_id) on delete restrict on update restrict,
  created_at timestamptz not null default pg_catalog.now(),
  constraint subscription_events_id_len check (char_length(external_event_id) between 1 and 120),
  constraint subscription_events_token check (external_event_id ~ '^[A-Za-z0-9._:-]+$')
);

create index if not exists subscription_events_subscription_idx
  on billing.subscription_events (subscription_id, created_at desc);

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
  pending_active boolean;
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
    if new.pending_plan_id is not null then
      select p.active into pending_active from billing.plans p where p.plan_id = new.pending_plan_id;
      if pending_active is distinct from true then
        raise exception 'pending plan must be active';
      end if;
    end if;
    if new.status is distinct from 'PAST_DUE' then
      new.past_due_grace_until := null;
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

  if new.current_period_start is distinct from old.current_period_start then
    raise exception 'current_period_start is immutable';
  end if;

  if new.current_period_end > old.current_period_end then
    raise exception 'current_period_end cannot be extended';
  end if;

  if old.external_event_id is not null then
    new.external_event_id := old.external_event_id;
  end if;

  if old.provider <> '' and new.provider is distinct from old.provider then
    raise exception 'provider is immutable once set';
  end if;
  if old.provider_customer_ref <> ''
     and new.provider_customer_ref is distinct from old.provider_customer_ref then
    raise exception 'provider_customer_ref is immutable once set';
  end if;
  if old.provider_subscription_ref <> ''
     and new.provider_subscription_ref is distinct from old.provider_subscription_ref then
    raise exception 'provider_subscription_ref is immutable once set';
  end if;

  if old.past_due_grace_until is not null
     and new.past_due_grace_until is not null
     and new.past_due_grace_until > old.past_due_grace_until then
    raise exception 'past_due_grace_until cannot be extended';
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

-- Concurrent create authority is subscriptions_one_open_per_user_uidx
-- (user_id WHERE status in TRIALING/ACTIVE/PAST_DUE/PAUSED). PostgreSQL
-- unique-index insertion is atomic across sessions. No advisory lock and
-- no global lock: different users hash to different keys. SELECT-then-INSERT
-- is not the security boundary. CANCELED/EXPIRED are excluded so a later
-- open row can be created without deleting history.

create or replace function billing.create_subscription(
  p_user_id uuid,
  p_plan_id text,
  p_status text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean default false,
  p_external_event_id text default null,
  p_past_due_grace_until timestamptz default null,
  p_pending_plan_id text default null,
  p_pending_plan_change text default null
)
returns billing.subscriptions
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing billing.subscriptions;
  created billing.subscriptions;
  plan_version integer;
begin
  if p_user_id is null then
    raise exception 'invalid_user_id';
  end if;
  if p_period_end is null or p_period_start is null or p_period_end <= p_period_start then
    raise exception 'invalid_period';
  end if;
  if p_status not in ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED') then
    raise exception 'invalid_status';
  end if;
  select p.version into plan_version
  from billing.plans p
  where p.plan_id = p_plan_id and p.active = true;
  if plan_version is null then
    raise exception 'new subscription requires an active plan';
  end if;

  begin
    insert into billing.subscriptions (
      cancel_at_period_end,
      current_period_end,
      current_period_start,
      external_event_id,
      past_due_grace_until,
      pending_plan_change,
      pending_plan_id,
      plan_id,
      plan_version,
      status,
      user_id
    ) values (
      coalesce(p_cancel_at_period_end, false),
      p_period_end,
      p_period_start,
      p_external_event_id,
      p_past_due_grace_until,
      p_pending_plan_change,
      p_pending_plan_id,
      p_plan_id,
      plan_version,
      p_status,
      p_user_id
    )
    returning * into created;
    if p_external_event_id is not null then
      insert into billing.subscription_events (external_event_id, subscription_id)
      values (p_external_event_id, created.subscription_id);
    end if;
    return created;
  exception
    when unique_violation then
      if p_external_event_id is not null then
        select s.* into existing
        from billing.subscription_events e
        inner join billing.subscriptions s on s.subscription_id = e.subscription_id
        where e.external_event_id = p_external_event_id
        limit 1;
        if found then
          return existing;
        end if;
      end if;
      raise exception 'duplicate_open_subscription';
  end;
end;
$$;

create or replace function billing.transition_subscription(
  p_subscription_id text,
  p_to_status text,
  p_cancel_at_period_end boolean default null,
  p_external_event_id text default null,
  p_past_due_grace_until timestamptz default null
)
returns billing.subscriptions
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing billing.subscriptions;
  updated billing.subscriptions;
begin
  if p_external_event_id is not null then
    select s.* into existing
    from billing.subscription_events e
    inner join billing.subscriptions s on s.subscription_id = e.subscription_id
    where e.external_event_id = p_external_event_id
    limit 1;
    if found then
      return existing;
    end if;
  end if;
  select s.* into existing
  from billing.subscriptions s
  where s.subscription_id = p_subscription_id
  for update;
  if not found then
    raise exception 'subscription_not_found';
  end if;
  if not billing.subscription_transition_allowed(existing.status, p_to_status) then
    raise exception 'illegal subscription transition % -> %', existing.status, p_to_status;
  end if;
  update billing.subscriptions s
  set
    status = p_to_status,
    cancel_at_period_end = coalesce(p_cancel_at_period_end, s.cancel_at_period_end),
    past_due_grace_until = case
      when p_to_status is distinct from 'PAST_DUE' then null
      else coalesce(p_past_due_grace_until, s.past_due_grace_until)
    end
  where s.subscription_id = p_subscription_id
  returning * into updated;
  if p_external_event_id is not null then
    insert into billing.subscription_events (external_event_id, subscription_id)
    values (p_external_event_id, updated.subscription_id);
  end if;
  return updated;
end;
$$;

create or replace function billing.schedule_cancel_at_period_end(
  p_subscription_id text,
  p_external_event_id text default null
)
returns billing.subscriptions
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing billing.subscriptions;
  updated billing.subscriptions;
begin
  if p_external_event_id is not null then
    select s.* into existing
    from billing.subscription_events e
    inner join billing.subscriptions s on s.subscription_id = e.subscription_id
    where e.external_event_id = p_external_event_id
    limit 1;
    if found then
      return existing;
    end if;
  end if;
  select s.* into existing
  from billing.subscriptions s
  where s.subscription_id = p_subscription_id
  for update;
  if not found then
    raise exception 'subscription_not_found';
  end if;
  if existing.status not in ('TRIALING', 'ACTIVE') then
    raise exception 'illegal subscription transition';
  end if;
  update billing.subscriptions s
  set cancel_at_period_end = true
  where s.subscription_id = p_subscription_id
  returning * into updated;
  if p_external_event_id is not null then
    insert into billing.subscription_events (external_event_id, subscription_id)
    values (p_external_event_id, updated.subscription_id);
  end if;
  return updated;
end;
$$;

revoke all on function billing.subscription_transition_allowed(text, text) from public, anon, authenticated;
revoke all on function billing.guard_subscription_row() from public, anon, authenticated;
revoke all on function billing.create_subscription(uuid, text, text, timestamptz, timestamptz, boolean, text, timestamptz, text, text) from public, anon, authenticated;
revoke all on function billing.transition_subscription(text, text, boolean, text, timestamptz) from public, anon, authenticated;
revoke all on function billing.schedule_cancel_at_period_end(text, text) from public, anon, authenticated;

grant execute on function billing.create_subscription(uuid, text, text, timestamptz, timestamptz, boolean, text, timestamptz, text, text) to service_role;
grant execute on function billing.transition_subscription(text, text, boolean, text, timestamptz) to service_role;
grant execute on function billing.schedule_cancel_at_period_end(text, text) to service_role;

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

revoke all privileges on table billing.subscriptions from public, anon, authenticated, service_role;
grant select on table billing.subscriptions to service_role;
revoke insert, update, delete on table billing.subscriptions from public, anon, authenticated, service_role;

alter table billing.subscription_events enable row level security;
alter table billing.subscription_events force row level security;

drop policy if exists subscription_events_deny_all on billing.subscription_events;
create policy subscription_events_deny_all
on billing.subscription_events
as restrictive
for all
to public
using (false)
with check (false);

revoke all privileges on table billing.subscription_events from public, anon, authenticated, service_role;
grant select on table billing.subscription_events to service_role;
revoke insert, update, delete on table billing.subscription_events from public, anon, authenticated, service_role;
