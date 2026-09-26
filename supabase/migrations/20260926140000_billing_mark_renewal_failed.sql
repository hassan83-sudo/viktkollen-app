-- BILL-7Q durable failed renewal.
-- Local migration only. DO NOT apply to staging. DO NOT apply to production.
-- Records ACTIVE -> PAST_DUE as operation renewal.failed.
-- Does not reuse billing.transition_subscription: that helper replays any
-- event without comparing grace and does not record renewal.failed.
-- Does not change plan_id, plan_version, pending plan, or cancel_at_period_end.
-- Does not advance the period or apply a pending plan.
-- A failure applies only when p_period_end equals the locked current_period_end.
-- current_period_end moves only forward, and only in advance_subscription_period.
-- A different event for an older period is recorded and does not mutate the row.
-- Does not write quota or create public.user_entitlements.

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
  or (
    operation = 'renewal.failed'
    and from_status = 'ACTIVE'
    and to_status = 'PAST_DUE'
    and from_plan_id is not null
    and to_plan_id = from_plan_id
    and from_plan_version is not null
    and to_plan_version = from_plan_version
    and previous_period_end is not null
    and new_period_end = previous_period_end
    and from_cancel_at_period_end is not null
    and to_cancel_at_period_end = from_cancel_at_period_end
    and to_pending_plan_id is not distinct from previous_pending_plan_id
    and to_pending_plan_change is not distinct from previous_pending_plan_change
  )
  or (
    operation = 'renewal.failed'
    and from_status = to_status
    and from_status in ('ACTIVE', 'PAST_DUE')
    and from_plan_id is not null
    and to_plan_id = from_plan_id
    and from_plan_version is not null
    and to_plan_version = from_plan_version
    and previous_period_end is not null
    and new_period_end = previous_period_end
    and from_cancel_at_period_end is not null
    and to_cancel_at_period_end = from_cancel_at_period_end
    and to_pending_plan_id is not distinct from previous_pending_plan_id
    and to_pending_plan_change is not distinct from previous_pending_plan_change
  )
);

create or replace function billing.mark_renewal_failed(
  p_subscription_id text,
  p_external_event_id text,
  p_past_due_grace_until timestamptz,
  p_period_end timestamptz
)
returns billing.subscriptions
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing billing.subscriptions;
  updated billing.subscriptions;
  prior_operation text;
  prior_grace timestamptz;
  prior_period timestamptz;
  changed boolean := false;
begin
  if p_external_event_id is null
     or p_external_event_id !~ '^[A-Za-z0-9._:-]+$'
     or char_length(p_external_event_id) > 120 then
    raise exception 'invalid_event_id';
  end if;

  select e.operation, e.past_due_grace_until, e.previous_period_end
    into prior_operation, prior_grace, prior_period
  from billing.subscription_events e
  where e.external_event_id = p_external_event_id;
  if found then
    if prior_operation = 'renewal.failed'
       and prior_grace is not distinct from p_past_due_grace_until
       and prior_period is not distinct from p_period_end then
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

  select e.operation, e.past_due_grace_until, e.previous_period_end
    into prior_operation, prior_grace, prior_period
  from billing.subscription_events e
  where e.external_event_id = p_external_event_id;
  if found then
    if prior_operation = 'renewal.failed'
       and prior_grace is not distinct from p_past_due_grace_until
       and prior_period is not distinct from p_period_end then
      select s.* into existing
      from billing.subscription_events e
      inner join billing.subscriptions s on s.subscription_id = e.subscription_id
      where e.external_event_id = p_external_event_id;
      return existing;
    end if;
    raise exception 'duplicate_external_event';
  end if;

  if existing.status not in ('ACTIVE', 'PAST_DUE') then
    raise exception 'illegal_subscription_transition';
  end if;

  if p_period_end is null then
    raise exception 'invalid_period';
  end if;

  if p_period_end is distinct from existing.current_period_end then
    changed := false;
  elsif existing.status = 'PAST_DUE' then
    changed := false;
  else
    update billing.subscriptions s
    set
      status = 'PAST_DUE',
      past_due_grace_until = p_past_due_grace_until
    where s.subscription_id = existing.subscription_id
    returning * into updated;
    changed := true;
  end if;

  insert into billing.subscription_events (
    external_event_id,
    from_cancel_at_period_end,
    from_plan_id,
    from_plan_version,
    from_status,
    new_period_end,
    operation,
    past_due_grace_until,
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
    p_period_end,
    'renewal.failed',
    p_past_due_grace_until,
    existing.pending_plan_change,
    existing.pending_plan_id,
    p_period_end,
    existing.subscription_id,
    existing.cancel_at_period_end,
    existing.pending_plan_change,
    existing.pending_plan_id,
    existing.plan_id,
    existing.plan_version,
    case when changed then 'PAST_DUE' else existing.status end
  );
  if changed then
    return updated;
  end if;
  return existing;
exception
  when unique_violation then
    raise exception 'duplicate_external_event';
end;
$$;

revoke all on function billing.mark_renewal_failed(text, text, timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function billing.mark_renewal_failed(text, text, timestamptz, timestamptz) to service_role;
