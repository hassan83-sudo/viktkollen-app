-- BILL-7E provider-neutral next-period plan change.
-- Local migration only. DO NOT apply to staging. DO NOT apply to production.
-- Does not create a provider, checkout, webhook, or payment token.
-- Does not change plan_id or plan_version. Does not apply the pending plan.
-- Does not ALTER billing.user_plan_assignments, billing.plan_entitlements,
-- billing.usage_events, or quota reservation tables.
-- Does not create public.user_entitlements.

alter table billing.subscription_events
  add column if not exists to_pending_plan_id text,
  add column if not exists to_pending_plan_change text;

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
  or (
    operation = 'subscription.terminal'
    and from_status in ('TRIALING', 'ACTIVE', 'PAST_DUE')
    and to_status in ('CANCELED', 'EXPIRED')
    and from_plan_id is not null
    and to_plan_id = from_plan_id
    and from_plan_version is not null
    and to_plan_version = from_plan_version
    and previous_period_end is not null
    and new_period_end = previous_period_end
    and from_cancel_at_period_end is not null
    and to_cancel_at_period_end = from_cancel_at_period_end
    and (
      (to_status = 'CANCELED' and from_status in ('TRIALING', 'ACTIVE') and from_cancel_at_period_end = true)
      or (to_status = 'EXPIRED' and from_status = 'ACTIVE' and from_cancel_at_period_end = false)
      or (to_status = 'EXPIRED' and from_status = 'PAST_DUE')
    )
  )
  or (
    operation = 'plan.schedule'
    and from_status in ('ACTIVE', 'PAST_DUE')
    and to_status = from_status
    and from_plan_id is not null
    and to_plan_id = from_plan_id
    and from_plan_version is not null
    and to_plan_version = from_plan_version
    and previous_period_end is not null
    and new_period_end = previous_period_end
    and from_cancel_at_period_end is not null
    and to_cancel_at_period_end = from_cancel_at_period_end
    and to_pending_plan_change = 'next_period'
    and to_pending_plan_id is not null
    and to_pending_plan_id <> from_plan_id
    and to_pending_plan_id <> 'plan.free'
  )
);

create or replace function billing.schedule_next_period_plan_change(
  p_subscription_id text,
  p_plan_id text,
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
  plan_active boolean;
  prior_plan text;
  prior_operation text;
begin
  if p_external_event_id is null
     or p_external_event_id !~ '^[A-Za-z0-9._:-]+$'
     or char_length(p_external_event_id) > 120 then
    raise exception 'invalid_event_id';
  end if;

  select e.operation, e.to_pending_plan_id
    into prior_operation, prior_plan
  from billing.subscription_events e
  where e.external_event_id = p_external_event_id;
  if found then
    if prior_operation = 'plan.schedule' and prior_plan = p_plan_id then
      select s.* into existing
      from billing.subscription_events e
      inner join billing.subscriptions s on s.subscription_id = e.subscription_id
      where e.external_event_id = p_external_event_id;
      return existing;
    end if;
    raise exception 'duplicate_external_event';
  end if;

  select s.* into existing
  from billing.subscriptions s
  where s.subscription_id = p_subscription_id
  for update;
  if not found then
    raise exception 'subscription_not_found';
  end if;

  select e.operation, e.to_pending_plan_id
    into prior_operation, prior_plan
  from billing.subscription_events e
  where e.external_event_id = p_external_event_id;
  if found then
    if prior_operation = 'plan.schedule' and prior_plan = p_plan_id then
      return existing;
    end if;
    raise exception 'duplicate_external_event';
  end if;

  if existing.status not in ('ACTIVE', 'PAST_DUE') then
    raise exception 'illegal subscription transition';
  end if;

  select p.active into plan_active
  from billing.plans p
  where p.plan_id = p_plan_id;
  if plan_active is distinct from true
     or p_plan_id = 'plan.free'
     or p_plan_id = existing.plan_id then
    raise exception 'invalid_pending_plan';
  end if;

  update billing.subscriptions s
  set
    pending_plan_id = p_plan_id,
    pending_plan_change = 'next_period'
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
    previous_pending_plan_change,
    previous_pending_plan_id,
    previous_period_end,
    subscription_id,
    to_cancel_at_period_end,
    to_pending_plan_change,
    to_pending_plan_id,
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
    'plan.schedule',
    existing.pending_plan_change,
    existing.pending_plan_id,
    existing.current_period_end,
    updated.subscription_id,
    existing.cancel_at_period_end,
    'next_period',
    p_plan_id,
    existing.plan_id,
    existing.plan_version,
    existing.status
  );
  return updated;
end;
$$;

revoke all on function billing.schedule_next_period_plan_change(text, text, text) from public, anon, authenticated, service_role;
grant execute on function billing.schedule_next_period_plan_change(text, text, text) to service_role;
