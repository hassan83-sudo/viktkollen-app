-- BILL-6C7B provider-neutral terminalization.
-- Local migration only. DO NOT apply to staging. DO NOT apply to production.
-- Does not create a provider, checkout, webhook, or payment token.
-- Does not schedule itself. Does not ALTER billing.usage_events or quota reservation tables.
-- cancel_at_period_end is kept on the terminal row. Entitlement still ends.
-- past_due_grace_until is cleared because it is allowed only while PAST_DUE.
-- The event keeps the pre-terminal flag, grace, and pending plan.

alter table billing.subscription_events
  add column if not exists past_due_grace_until timestamptz,
  add column if not exists previous_pending_plan_id text,
  add column if not exists previous_pending_plan_change text;

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
);

create or replace function billing.finalize_open_subscription(
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
  target text;
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
  if existing.status in ('CANCELED', 'EXPIRED') then
    return existing;
  end if;
  target := null;
  if existing.status in ('TRIALING', 'ACTIVE')
     and existing.cancel_at_period_end is true
     and pg_catalog.now() >= existing.current_period_end then
    target := 'CANCELED';
  elsif existing.status = 'ACTIVE'
     and existing.cancel_at_period_end is distinct from true
     and pg_catalog.now() >= existing.current_period_end then
    target := 'EXPIRED';
  elsif existing.status = 'PAST_DUE'
     and (
       existing.past_due_grace_until is null
       or pg_catalog.now() >= existing.past_due_grace_until
     ) then
    target := 'EXPIRED';
  end if;
  if target is null then
    return existing;
  end if;
  update billing.subscriptions s
  set
    status = target,
    pending_plan_id = null,
    pending_plan_change = null,
    past_due_grace_until = null
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
    past_due_grace_until,
    previous_pending_plan_change,
    previous_pending_plan_id,
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
    'subscription.terminal',
    existing.past_due_grace_until,
    existing.pending_plan_change,
    existing.pending_plan_id,
    existing.current_period_end,
    updated.subscription_id,
    existing.cancel_at_period_end,
    existing.plan_id,
    existing.plan_version,
    target
  );
  return updated;
end;
$$;

revoke all on function billing.finalize_open_subscription(text, text) from public, anon, authenticated, service_role;
grant execute on function billing.finalize_open_subscription(text, text) to service_role;
