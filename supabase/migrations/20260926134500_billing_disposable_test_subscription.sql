-- BILL-7U2B disposable billing test fixtures.
-- Local migration only. DO NOT apply to staging. DO NOT apply to production.
-- Requires 20260926133000. Does not modify 20260926140000.
-- Safe in any environment: an ordinary subscription cannot be marked or deleted.
-- Does not disable subscriptions_guard. Does not use session_replication_role.
-- Does not write plans, plan_entitlements, quota, usage, or feature controls.

create table if not exists billing.disposable_test_subscriptions (
  subscription_id text primary key,
  user_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint disposable_test_subscriptions_subscription_fk
    foreign key (subscription_id)
    references billing.subscriptions (subscription_id)
    deferrable initially deferred
);

alter table billing.disposable_test_subscriptions enable row level security;
alter table billing.disposable_test_subscriptions force row level security;
revoke all on table billing.disposable_test_subscriptions from public, anon, authenticated, service_role;

drop policy if exists "No direct access to disposable test subscriptions" on billing.disposable_test_subscriptions;
create policy "No direct access to disposable test subscriptions"
on billing.disposable_test_subscriptions
as restrictive
for all
to public
using (false)
with check (false);

revoke delete on table billing.subscriptions from public, anon, authenticated, service_role;

create or replace function billing.disposable_fixture_delete_allowed(p_subscription_id text)
returns boolean
language sql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
  select
    pg_catalog.current_setting('billing.disposable_cleanup_subscription_id', true)
      is not distinct from p_subscription_id
    and exists (
      select 1
      from billing.disposable_test_subscriptions d
      where d.subscription_id = p_subscription_id
    );
$$;

create or replace function billing.guard_subscription_row()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  plan_active boolean;
  pending_active boolean;
  advancing boolean;
begin
  if tg_op = 'DELETE' then
    if not billing.disposable_fixture_delete_allowed(old.subscription_id) then
      raise exception 'subscriptions are not deletable';
    end if;
    return old;
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

  advancing := pg_catalog.current_setting('billing.allow_period_advance', true) = '1';

  if new.subscription_id is distinct from old.subscription_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'subscription identity and plan snapshot are immutable';
  end if;

  if (new.plan_id is distinct from old.plan_id or new.plan_version is distinct from old.plan_version)
     and not advancing then
    raise exception 'subscription identity and plan snapshot are immutable';
  end if;

  if new.current_period_start is distinct from old.current_period_start then
    raise exception 'current_period_start is immutable';
  end if;

  if new.current_period_end < old.current_period_end then
    raise exception 'current_period_end cannot be shortened';
  end if;

  if new.current_period_end > old.current_period_end and not advancing then
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

create or replace function billing.create_disposable_test_subscription(
  p_plan_id text,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns table (
  subscription_id text,
  user_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  created billing.subscriptions;
  v_user_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not_allowed';
  end if;
  if p_period_end is null or p_period_start is null or p_period_end <= p_period_start then
    raise exception 'invalid_period';
  end if;

  v_user_id := pg_catalog.gen_random_uuid();
  created := billing.create_subscription(
    p_user_id => v_user_id,
    p_plan_id => p_plan_id,
    p_status => 'ACTIVE',
    p_period_start => p_period_start,
    p_period_end => p_period_end,
    p_cancel_at_period_end => false,
    p_external_event_id => null,
    p_past_due_grace_until => null,
    p_pending_plan_id => null,
    p_pending_plan_change => null
  );

  insert into billing.disposable_test_subscriptions (subscription_id, user_id)
  values (created.subscription_id, created.user_id);
  return query
  select created.subscription_id, created.user_id;
end;
$$;

create or replace function billing.cleanup_disposable_test_subscription(
  p_subscription_id text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  marker billing.disposable_test_subscriptions;
  target billing.subscriptions;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not_allowed';
  end if;
  if p_subscription_id is null or char_length(p_subscription_id) = 0 then
    raise exception 'disposable_fixture_not_found';
  end if;

  select d.* into marker
  from billing.disposable_test_subscriptions d
  where d.subscription_id = p_subscription_id
  for update;
  if not found then
    raise exception 'disposable_fixture_not_found';
  end if;

  perform s.subscription_id
  from billing.subscriptions s
  where s.user_id = marker.user_id
  order by s.subscription_id
  for update;

  select d.* into marker
  from billing.disposable_test_subscriptions d
  where d.subscription_id = p_subscription_id
  for update;
  if not found then
    raise exception 'disposable_fixture_not_found';
  end if;

  select s.* into target
  from billing.subscriptions s
  where s.subscription_id = p_subscription_id;
  if not found or target.user_id is distinct from marker.user_id then
    raise exception 'disposable_fixture_unsafe';
  end if;

  if exists (
    select 1
    from billing.subscriptions s
    where s.user_id = marker.user_id
      and not exists (
        select 1
        from billing.disposable_test_subscriptions d
        where d.subscription_id = s.subscription_id
      )
  ) then
    raise exception 'disposable_fixture_unsafe';
  end if;

  if exists (
    select 1 from billing.quota_reservations q where q.user_id = marker.user_id
  ) or exists (
    select 1 from billing.quota_period_locks q where q.user_id = marker.user_id
  ) or exists (
    select 1 from billing.usage_events u where u.user_id = marker.user_id
  ) then
    raise exception 'disposable_fixture_unsafe';
  end if;

  delete from billing.user_plan_assignment_events e
  where e.subscription_id = target.subscription_id;

  delete from billing.subscription_events e
  where e.subscription_id = target.subscription_id;

  delete from billing.user_plan_assignments a
  where a.user_id = target.user_id
    and not exists (
      select 1
      from billing.subscriptions s
      where s.user_id = target.user_id
        and s.subscription_id is distinct from target.subscription_id
    );

  perform pg_catalog.set_config('billing.disposable_cleanup_subscription_id', target.subscription_id, true);
  begin
    delete from billing.subscriptions s
    where s.subscription_id = target.subscription_id;
    delete from billing.disposable_test_subscriptions d
    where d.subscription_id = target.subscription_id;
    perform pg_catalog.set_config('billing.disposable_cleanup_subscription_id', '', true);
  exception
    when others then
      perform pg_catalog.set_config('billing.disposable_cleanup_subscription_id', '', true);
      raise;
  end;
end;
$$;

revoke all on function billing.disposable_fixture_delete_allowed(text) from public, anon, authenticated, service_role;
revoke all on function billing.guard_subscription_row() from public, anon, authenticated, service_role;
revoke all on function billing.create_disposable_test_subscription(text, timestamptz, timestamptz) from public, anon, authenticated, service_role;
revoke all on function billing.cleanup_disposable_test_subscription(text) from public, anon, authenticated, service_role;
grant execute on function billing.create_disposable_test_subscription(text, timestamptz, timestamptz) to service_role;
grant execute on function billing.cleanup_disposable_test_subscription(text) to service_role;
