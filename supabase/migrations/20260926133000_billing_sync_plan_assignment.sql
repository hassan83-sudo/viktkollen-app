-- BILL-7P durable plan assignment sync.
-- Local migration only. DO NOT apply to staging. DO NOT apply to production.
-- Derives billing.user_plan_assignments from the trusted subscription row.
-- Does not accept a caller-supplied plan, limit, or quota.
-- Does not write quota reservations or usage.
-- Does not create public.user_entitlements.
-- Does not activate a pending next-period plan.
-- Does not downgrade a scheduled cancellation before period end.

create table if not exists billing.user_plan_assignment_events (
  external_event_id text primary key,
  user_id uuid not null,
  plan_id text not null references billing.plans (plan_id),
  plan_version integer not null,
  source text not null,
  subscription_id text not null references billing.subscriptions (subscription_id),
  created_at timestamptz not null default pg_catalog.now(),
  constraint user_plan_assignment_events_id_len check (char_length(external_event_id) between 1 and 120),
  constraint user_plan_assignment_events_token check (external_event_id ~ '^[A-Za-z0-9._:-]+$'),
  constraint user_plan_assignment_events_source_known check (source in ('server', 'server-default')),
  constraint user_plan_assignment_events_version_positive check (plan_version >= 1)
);

alter table billing.user_plan_assignment_events enable row level security;
alter table billing.user_plan_assignment_events force row level security;
revoke all on table billing.user_plan_assignment_events from public, anon, authenticated, service_role;

drop policy if exists "No direct client access to plan assignment events" on billing.user_plan_assignment_events;
create policy "No direct client access to plan assignment events"
on billing.user_plan_assignment_events as restrictive for all to public using (false) with check (false);

create or replace function billing.sync_plan_assignment_from_subscription(
  p_subscription_id text,
  p_external_event_id text
)
returns billing.user_plan_assignments
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  anchor billing.subscriptions;
  chosen billing.subscriptions;
  prior billing.user_plan_assignment_events;
  assigned billing.user_plan_assignments;
  v_user_id uuid;
  baseline_version integer;
  target_plan text;
  target_version integer;
  target_source text;
begin
  if p_external_event_id is null
     or p_external_event_id !~ '^[A-Za-z0-9._:-]+$'
     or char_length(p_external_event_id) > 120 then
    raise exception 'invalid_event_id';
  end if;

  -- Replay depends on the derived plan, so this read does not return before the lock.
  perform 1
  from billing.user_plan_assignment_events e
  where e.external_event_id = p_external_event_id;

  select s.user_id into v_user_id
  from billing.subscriptions s
  where s.subscription_id = p_subscription_id;
  if not found then
    raise exception 'subscription_not_found';
  end if;

  perform s.subscription_id
  from billing.subscriptions s
  where s.user_id = v_user_id
  order by s.subscription_id
  for update;

  select s.* into anchor
  from billing.subscriptions s
  where s.subscription_id = p_subscription_id;
  if not found then
    raise exception 'subscription_not_found';
  end if;

  select p.version into baseline_version
  from billing.plans p
  where p.plan_id = 'plan.free';
  if baseline_version is null then
    raise exception 'unknown_plan';
  end if;

  select s.* into chosen
  from billing.subscriptions s
  where s.user_id = anchor.user_id
    and pg_catalog.now() >= s.current_period_start
    and pg_catalog.now() < s.current_period_end
    and (
      s.status in ('TRIALING', 'ACTIVE')
      or (
        s.status = 'PAST_DUE'
        and s.past_due_grace_until is not null
        and pg_catalog.now() < s.past_due_grace_until
      )
    )
  order by s.current_period_end desc, s.subscription_id asc
  limit 1;

  if not found then
    target_plan := 'plan.free';
    target_version := baseline_version;
    target_source := 'server-default';
  elsif not exists (
    select 1 from billing.plans p where p.plan_id = chosen.plan_id
  ) then
    target_plan := 'plan.free';
    target_version := baseline_version;
    target_source := 'server-default';
  else
    target_plan := chosen.plan_id;
    target_version := chosen.plan_version;
    target_source := 'server';
  end if;

  select e.* into prior
  from billing.user_plan_assignment_events e
  where e.external_event_id = p_external_event_id;
  if found then
    if prior.user_id is distinct from anchor.user_id
       or prior.plan_id is distinct from target_plan
       or prior.plan_version is distinct from target_version
       or prior.source is distinct from target_source then
      raise exception 'duplicate_external_event';
    end if;
    select a.* into assigned
    from billing.user_plan_assignments a
    where a.user_id = prior.user_id;
    if not found then
      raise exception 'durable_operation_unavailable';
    end if;
    return assigned;
  end if;

  insert into billing.user_plan_assignments (
    assigned_at,
    plan_id,
    plan_version,
    source,
    user_id
  ) values (
    pg_catalog.now(),
    target_plan,
    target_version,
    target_source,
    anchor.user_id
  )
  on conflict (user_id) do update
  set
    assigned_at = excluded.assigned_at,
    plan_id = excluded.plan_id,
    plan_version = excluded.plan_version,
    source = excluded.source
  returning * into assigned;

  insert into billing.user_plan_assignment_events (
    external_event_id,
    plan_id,
    plan_version,
    source,
    subscription_id,
    user_id
  ) values (
    p_external_event_id,
    target_plan,
    target_version,
    target_source,
    anchor.subscription_id,
    anchor.user_id
  );
  return assigned;
exception
  when unique_violation then
    raise exception 'duplicate_external_event';
end;
$$;

revoke all on function billing.sync_plan_assignment_from_subscription(text, text) from public, anon, authenticated, service_role;
grant execute on function billing.sync_plan_assignment_from_subscription(text, text) to service_role;
