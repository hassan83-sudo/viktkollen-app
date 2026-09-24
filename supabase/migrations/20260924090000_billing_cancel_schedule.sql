-- BILL-6C6A provider-neutral cancel and undo.
-- Local migration only. DO NOT apply to staging. DO NOT apply to production.
-- Does not create a provider, checkout, webhook, or payment token.
-- Does not expire subscriptions automatically.
-- Does not ALTER billing.usage_events or quota reservation tables.

alter table billing.subscription_events
  add column if not exists from_cancel_at_period_end boolean,
  add column if not exists to_cancel_at_period_end boolean;

alter table billing.subscription_events drop constraint if exists subscription_events_period_advance_known;
alter table billing.subscription_events add constraint subscription_events_period_advance_known check (
  operation is null
  or (
    operation = 'period.advance'
    and previous_period_end is not null
    and new_period_end is not null
    and new_period_end > previous_period_end
    and from_status in ('ACTIVE', 'PAST_DUE')
    and to_status = 'ACTIVE'
    and from_plan_id is not null
    and to_plan_id is not null
    and from_plan_version is not null
    and to_plan_version is not null
  )
  or (
    operation in ('cancel.schedule', 'cancel.clear')
    and from_status in ('TRIALING', 'ACTIVE')
    and to_status = from_status
    and from_plan_id is not null
    and to_plan_id = from_plan_id
    and from_plan_version is not null
    and to_plan_version = from_plan_version
    and previous_period_end is not null
    and new_period_end = previous_period_end
    and from_cancel_at_period_end is not null
    and to_cancel_at_period_end is not null
    and (
      (operation = 'cancel.schedule' and to_cancel_at_period_end = true)
      or (operation = 'cancel.clear' and from_cancel_at_period_end = true and to_cancel_at_period_end = false)
    )
  )
);

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
    if p_external_event_id !~ '^[A-Za-z0-9._:-]+$' or char_length(p_external_event_id) > 120 then
      raise exception 'invalid_event_id';
    end if;
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
  if p_external_event_id is not null and exists (
    select 1 from billing.subscription_events e where e.external_event_id = p_external_event_id
  ) then
    return existing;
  end if;
  if existing.status not in ('TRIALING', 'ACTIVE') then
    raise exception 'illegal subscription transition';
  end if;
  update billing.subscriptions s
  set cancel_at_period_end = true
  where s.subscription_id = p_subscription_id
  returning * into updated;
  if p_external_event_id is not null then
    insert into billing.subscription_events (
      external_event_id,
      from_cancel_at_period_end,
      from_plan_id,
      from_plan_version,
      from_status,
      new_period_end,
      operation,
      previous_period_end,
      subscription_id,
      to_cancel_at_period_end,
      to_plan_id,
      to_plan_version,
      to_status
    ) values (
      p_external_event_id,
      existing.cancel_at_period_end,
      existing.plan_id,
      existing.plan_version,
      existing.status,
      existing.current_period_end,
      'cancel.schedule',
      existing.current_period_end,
      updated.subscription_id,
      true,
      existing.plan_id,
      existing.plan_version,
      existing.status
    );
  end if;
  return updated;
end;
$$;

create or replace function billing.clear_cancel_at_period_end(
  p_subscription_id text,
  p_external_event_id text
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
  if p_external_event_id is null
     or p_external_event_id !~ '^[A-Za-z0-9._:-]+$'
     or char_length(p_external_event_id) > 120 then
    raise exception 'invalid_event_id';
  end if;
  select s.* into existing
  from billing.subscription_events e
  inner join billing.subscriptions s on s.subscription_id = e.subscription_id
  where e.external_event_id = p_external_event_id
  limit 1;
  if found then
    return existing;
  end if;
  select s.* into existing
  from billing.subscriptions s
  where s.subscription_id = p_subscription_id
  for update;
  if not found then
    raise exception 'subscription_not_found';
  end if;
  if exists (
    select 1 from billing.subscription_events e where e.external_event_id = p_external_event_id
  ) then
    return existing;
  end if;
  if existing.status not in ('TRIALING', 'ACTIVE') then
    raise exception 'illegal subscription transition';
  end if;
  if pg_catalog.now() >= existing.current_period_end then
    raise exception 'period_expired';
  end if;
  if existing.cancel_at_period_end is distinct from true then
    raise exception 'cancel_not_scheduled';
  end if;
  update billing.subscriptions s
  set cancel_at_period_end = false
  where s.subscription_id = p_subscription_id
  returning * into updated;
  insert into billing.subscription_events (
    external_event_id,
    from_cancel_at_period_end,
    from_plan_id,
    from_plan_version,
    from_status,
    new_period_end,
    operation,
    previous_period_end,
    subscription_id,
    to_cancel_at_period_end,
    to_plan_id,
    to_plan_version,
    to_status
  ) values (
    p_external_event_id,
    true,
    existing.plan_id,
    existing.plan_version,
    existing.status,
    existing.current_period_end,
    'cancel.clear',
    existing.current_period_end,
    updated.subscription_id,
    false,
    existing.plan_id,
    existing.plan_version,
    existing.status
  );
  return updated;
end;
$$;

revoke all on function billing.schedule_cancel_at_period_end(text, text) from public, anon, authenticated, service_role;
revoke all on function billing.clear_cancel_at_period_end(text, text) from public, anon, authenticated, service_role;
grant execute on function billing.schedule_cancel_at_period_end(text, text) to service_role;
grant execute on function billing.clear_cancel_at_period_end(text, text) to service_role;
