-- BILL-6C4A provider-neutral period advance.
-- Local migration only. DO NOT apply to staging. DO NOT apply to production.
-- Does not create a provider, checkout, webhook, or payment token.
-- Does not apply pending_plan_id. The row lock is the boundary where a
-- later sprint can apply a next-period plan before the end moves.
-- Does not ALTER billing.usage_events or quota reservation tables.

alter table billing.subscription_events
  add column if not exists operation text,
  add column if not exists previous_period_end timestamptz,
  add column if not exists new_period_end timestamptz,
  add column if not exists from_status text,
  add column if not exists to_status text;

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
  )
);

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

  if new.current_period_end < old.current_period_end then
    raise exception 'current_period_end cannot be shortened';
  end if;

  if new.current_period_end > old.current_period_end
     and pg_catalog.current_setting('billing.allow_period_advance', true) is distinct from '1' then
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

create or replace function billing.advance_subscription_period(
  p_subscription_id text,
  p_period_end timestamptz,
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
  next_status text;
begin
  if p_external_event_id is null
     or p_external_event_id !~ '^[A-Za-z0-9._:-]+$'
     or char_length(p_external_event_id) > 120 then
    raise exception 'invalid_event_id';
  end if;
  if p_period_end is null then
    raise exception 'invalid_period';
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

  select s.* into updated
  from billing.subscription_events e
  inner join billing.subscriptions s on s.subscription_id = e.subscription_id
  where e.external_event_id = p_external_event_id
  limit 1;
  if found then
    return updated;
  end if;

  if existing.status not in ('ACTIVE', 'PAST_DUE') then
    raise exception 'illegal subscription transition';
  end if;
  if p_period_end <= existing.current_period_end then
    raise exception 'period_end_not_later';
  end if;

  next_status := 'ACTIVE';
  perform pg_catalog.set_config('billing.allow_period_advance', '1', true);
  update billing.subscriptions s
  set
    current_period_end = p_period_end,
    past_due_grace_until = null,
    status = next_status
  where s.subscription_id = p_subscription_id
  returning * into updated;

  insert into billing.subscription_events (
    external_event_id,
    from_status,
    new_period_end,
    operation,
    previous_period_end,
    subscription_id,
    to_status
  ) values (
    p_external_event_id,
    existing.status,
    p_period_end,
    'period.advance',
    existing.current_period_end,
    updated.subscription_id,
    next_status
  );
  return updated;
exception
  when unique_violation then
    select s.* into existing
    from billing.subscription_events e
    inner join billing.subscriptions s on s.subscription_id = e.subscription_id
    where e.external_event_id = p_external_event_id
    limit 1;
    if found then
      return existing;
    end if;
    raise;
end;
$$;

revoke all on function billing.advance_subscription_period(text, timestamptz, text) from public, anon, authenticated, service_role;
grant execute on function billing.advance_subscription_period(text, timestamptz, text) to service_role;
