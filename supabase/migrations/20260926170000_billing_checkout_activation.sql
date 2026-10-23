-- BILL-9B durable checkout intent and verified activation.
-- Local migration only. DO NOT apply to staging. DO NOT apply to production.
-- Checkout creation does not create a paid subscription.
-- Verified activation is one function so a failed step rolls back together.
-- Does not create public user entitlement rows.
-- Does not prorate or refund.

create table if not exists billing.checkout_intents (
  checkout_id text primary key,
  user_id uuid not null,
  plan_id text not null references billing.plans (plan_id),
  provider text not null,
  provider_checkout_ref text not null default '',
  provider_price_ref text not null default '',
  provider_event_id text not null default '',
  status text not null default 'pending',
  subscription_id text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint checkout_intents_id_len check (char_length(checkout_id) between 1 and 80),
  constraint checkout_intents_id_token check (checkout_id ~ '^[A-Za-z0-9._:-]+$'),
  constraint checkout_intents_provider_token check (provider ~ '^[A-Za-z0-9._-]{1,40}$'),
  constraint checkout_intents_checkout_ref_token check (provider_checkout_ref ~ '^[A-Za-z0-9._:-]*$'),
  constraint checkout_intents_price_ref_token check (provider_price_ref ~ '^[A-Za-z0-9._:-]*$'),
  constraint checkout_intents_event_token check (provider_event_id ~ '^[A-Za-z0-9._:-]*$'),
  constraint checkout_intents_status_known check (status in ('pending', 'consumed', 'expired', 'cancelled')),
  constraint checkout_intents_consumed_pair check (
    (status = 'consumed' and subscription_id is not null and provider_event_id <> '' and consumed_at is not null)
    or (status <> 'consumed' and consumed_at is null)
  )
);

create unique index if not exists checkout_intents_provider_checkout_uidx
  on billing.checkout_intents (provider, provider_checkout_ref)
  where provider_checkout_ref <> '';

create unique index if not exists checkout_intents_event_uidx
  on billing.checkout_intents (provider_event_id)
  where provider_event_id <> '';

alter table billing.checkout_intents enable row level security;
alter table billing.checkout_intents force row level security;
revoke all on table billing.checkout_intents from public, anon, authenticated, service_role;

drop policy if exists checkout_intents_deny_all on billing.checkout_intents;
create policy checkout_intents_deny_all
on billing.checkout_intents
as restrictive
for all
to public
using (false)
with check (false);

create or replace function billing.guard_checkout_intent_row()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'checkout intents are not deletable';
  end if;
  if tg_op = 'UPDATE' then
    if new.checkout_id is distinct from old.checkout_id
       or new.user_id is distinct from old.user_id
       or new.plan_id is distinct from old.plan_id
       or new.provider is distinct from old.provider
       or new.created_at is distinct from old.created_at then
      raise exception 'checkout intent identity is immutable';
    end if;
    if old.status <> 'pending' and new.status is distinct from old.status then
      raise exception 'checkout intent status is terminal';
    end if;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists checkout_intents_guard on billing.checkout_intents;
create trigger checkout_intents_guard
before insert or update or delete on billing.checkout_intents
for each row execute function billing.guard_checkout_intent_row();

create or replace function billing.create_checkout_intent(
  p_user_id uuid,
  p_plan_id text,
  p_provider text,
  p_provider_price_ref text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  created billing.checkout_intents;
  sale_enabled boolean;
begin
  if p_user_id is null or p_plan_id = 'plan.free' or p_expires_at is null or p_expires_at <= pg_catalog.now() then
    raise exception 'invalid_checkout_intent';
  end if;
  if p_provider is null or p_provider !~ '^[A-Za-z0-9._-]{1,40}$' then
    raise exception 'invalid_checkout_intent';
  end if;
  if not exists (select 1 from billing.plans plan where plan.plan_id = p_plan_id and plan.active = true) then
    raise exception 'invalid_checkout_intent';
  end if;
  sale_enabled := billing.plan_enabled_for_sale(p_plan_id);
  if sale_enabled is distinct from true then
    raise exception 'invalid_checkout_intent';
  end if;
  insert into billing.checkout_intents (
    checkout_id,
    expires_at,
    plan_id,
    provider,
    provider_price_ref,
    status,
    user_id
  ) values (
    'chk_' || replace(pg_catalog.gen_random_uuid()::text, '-', ''),
    p_expires_at,
    p_plan_id,
    p_provider,
    coalesce(p_provider_price_ref, ''),
    'pending',
    p_user_id
  )
  returning * into created;
  return pg_catalog.jsonb_build_object(
    'access_granted', false,
    'checkout_id', created.checkout_id,
    'expires_at', created.expires_at,
    'plan_id', created.plan_id,
    'provider', created.provider,
    'status', created.status,
    'subscription_id', null,
    'user_id', created.user_id
  );
end;
$$;

create or replace function billing.bind_provider_checkout_ref(
  p_checkout_id text,
  p_provider text,
  p_provider_checkout_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing billing.checkout_intents;
begin
  if p_provider_checkout_ref is null or p_provider_checkout_ref !~ '^[A-Za-z0-9._:-]{1,120}$' then
    raise exception 'invalid_checkout_ref';
  end if;
  select * into existing
  from billing.checkout_intents
  where checkout_id = p_checkout_id
  for update;
  if not found then
    raise exception 'checkout_intent_missing';
  end if;
  if existing.provider is distinct from p_provider then
    raise exception 'provider_mismatch';
  end if;
  if existing.status = 'cancelled' then
    raise exception 'checkout_intent_cancelled';
  end if;
  if existing.status = 'expired' or existing.expires_at <= pg_catalog.now() then
    raise exception 'checkout_intent_expired';
  end if;
  if existing.status <> 'pending' then
    raise exception 'checkout_intent_consumed';
  end if;
  if existing.provider_checkout_ref <> '' and existing.provider_checkout_ref is distinct from p_provider_checkout_ref then
    raise exception 'provider_checkout_conflict';
  end if;
  update billing.checkout_intents
  set provider_checkout_ref = p_provider_checkout_ref
  where checkout_id = p_checkout_id
  returning * into existing;
  return pg_catalog.jsonb_build_object(
    'access_granted', false,
    'checkout_id', existing.checkout_id,
    'plan_id', existing.plan_id,
    'provider', existing.provider,
    'provider_checkout_ref', existing.provider_checkout_ref,
    'status', existing.status,
    'user_id', existing.user_id
  );
exception
  when unique_violation then
    raise exception 'provider_checkout_conflict';
end;
$$;

create or replace function billing.cancel_checkout_intent(p_checkout_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing billing.checkout_intents;
begin
  select * into existing
  from billing.checkout_intents
  where checkout_id = p_checkout_id
  for update;
  if not found then
    raise exception 'checkout_intent_missing';
  end if;
  if existing.status = 'consumed' then
    raise exception 'checkout_intent_consumed';
  end if;
  if existing.status = 'pending' then
    update billing.checkout_intents
    set status = 'cancelled'
    where checkout_id = p_checkout_id
    returning * into existing;
  end if;
  return pg_catalog.jsonb_build_object(
    'access_granted', false,
    'checkout_id', existing.checkout_id,
    'status', existing.status,
    'subscription_id', existing.subscription_id
  );
end;
$$;

create or replace function billing.activate_verified_checkout(
  p_checkout_id text,
  p_provider text,
  p_provider_event_id text,
  p_provider_customer_ref text,
  p_provider_subscription_ref text,
  p_provider_checkout_ref text,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing billing.checkout_intents;
  created billing.subscriptions;
  assigned billing.user_plan_assignments;
begin
  if p_provider_event_id is null
     or p_provider_event_id !~ '^[A-Za-z0-9._:-]+$'
     or char_length(p_provider_event_id) > 120
     or p_provider_customer_ref is null
     or p_provider_customer_ref !~ '^[A-Za-z0-9._:-]{1,120}$'
     or p_provider_subscription_ref is null
     or p_provider_subscription_ref !~ '^[A-Za-z0-9._:-]{1,120}$'
     or p_period_end is null
     or p_period_start is null
     or p_period_end <= p_period_start then
    raise exception 'invalid_provider_event';
  end if;

  select * into existing
  from billing.checkout_intents
  where checkout_id = p_checkout_id
  for update;
  if not found then
    raise exception 'checkout_intent_missing';
  end if;
  if existing.provider is distinct from p_provider then
    raise exception 'provider_mismatch';
  end if;
  if existing.provider_checkout_ref <> ''
     and existing.provider_checkout_ref is distinct from coalesce(p_provider_checkout_ref, '') then
    raise exception 'provider_checkout_mismatch';
  end if;

  if existing.status = 'consumed' then
    if existing.provider_event_id is distinct from p_provider_event_id then
      raise exception 'checkout_intent_consumed';
    end if;
    select * into created
    from billing.subscriptions
    where subscription_id = existing.subscription_id;
    if created.user_id is distinct from existing.user_id
       or created.plan_id is distinct from existing.plan_id
       or created.provider_subscription_ref is distinct from p_provider_subscription_ref then
      raise exception 'duplicate_external_event';
    end if;
    select * into assigned
    from billing.user_plan_assignments
    where user_id = existing.user_id;
    return pg_catalog.jsonb_build_object(
      'access_granted', true,
      'assignment_plan_id', assigned.plan_id,
      'current_period_end', created.current_period_end,
      'plan_id', existing.plan_id,
      'provider', created.provider,
      'provider_customer_ref', created.provider_customer_ref,
      'provider_subscription_ref', created.provider_subscription_ref,
      'proration', false,
      'refund', false,
      'status', created.status,
      'subscription_id', created.subscription_id,
      'user_id', existing.user_id
    );
  end if;

  if existing.status = 'cancelled' then
    raise exception 'checkout_intent_cancelled';
  end if;
  if existing.status = 'expired' or existing.expires_at <= pg_catalog.now() then
    if existing.status = 'pending' then
      update billing.checkout_intents
      set status = 'expired'
      where checkout_id = existing.checkout_id;
    end if;
    raise exception 'checkout_intent_expired';
  end if;

  if exists (
    select 1
    from billing.subscriptions stored
    where stored.provider = p_provider
      and stored.provider_subscription_ref = p_provider_subscription_ref
  ) or exists (
    select 1
    from billing.checkout_intents other
    where other.provider_event_id = p_provider_event_id
      and other.checkout_id is distinct from existing.checkout_id
  ) then
    raise exception 'provider_subscription_conflict';
  end if;

  created := billing.create_subscription(
    p_user_id => existing.user_id,
    p_plan_id => existing.plan_id,
    p_status => 'ACTIVE',
    p_period_start => p_period_start,
    p_period_end => p_period_end,
    p_cancel_at_period_end => false,
    p_external_event_id => p_provider_event_id,
    p_past_due_grace_until => null,
    p_pending_plan_id => null,
    p_pending_plan_change => null
  );
  if created.user_id is distinct from existing.user_id or created.plan_id is distinct from existing.plan_id then
    raise exception 'checkout_binding_mismatch';
  end if;

  update billing.subscriptions
  set
    provider = p_provider,
    provider_customer_ref = p_provider_customer_ref,
    provider_subscription_ref = p_provider_subscription_ref
  where subscription_id = created.subscription_id
    and provider = ''
    and provider_customer_ref = ''
    and provider_subscription_ref = ''
  returning * into created;
  if created.provider is distinct from p_provider
     or created.provider_subscription_ref is distinct from p_provider_subscription_ref then
    raise exception 'provider_subscription_conflict';
  end if;

  assigned := billing.sync_plan_assignment_from_subscription(created.subscription_id, p_provider_event_id);
  if assigned.user_id is distinct from existing.user_id or assigned.plan_id is distinct from existing.plan_id then
    raise exception 'assignment_sync_unconfirmed';
  end if;

  update billing.checkout_intents
  set
    consumed_at = pg_catalog.now(),
    provider_event_id = p_provider_event_id,
    status = 'consumed',
    subscription_id = created.subscription_id
  where checkout_id = existing.checkout_id
  returning * into existing;

  return pg_catalog.jsonb_build_object(
    'access_granted', true,
    'assignment_plan_id', assigned.plan_id,
    'current_period_end', created.current_period_end,
    'plan_id', existing.plan_id,
    'provider', created.provider,
    'provider_customer_ref', created.provider_customer_ref,
    'provider_subscription_ref', created.provider_subscription_ref,
    'proration', false,
    'refund', false,
    'status', created.status,
    'subscription_id', created.subscription_id,
    'user_id', existing.user_id
  );
exception
  when unique_violation then
    raise exception 'provider_subscription_conflict';
end;
$$;

revoke all on function billing.guard_checkout_intent_row() from public, anon, authenticated, service_role;
revoke all on function billing.create_checkout_intent(uuid, text, text, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function billing.bind_provider_checkout_ref(text, text, text) from public, anon, authenticated, service_role;
revoke all on function billing.cancel_checkout_intent(text) from public, anon, authenticated, service_role;
revoke all on function billing.activate_verified_checkout(text, text, text, text, text, text, timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function billing.create_checkout_intent(uuid, text, text, text, timestamptz) to service_role;
grant execute on function billing.bind_provider_checkout_ref(text, text, text) to service_role;
grant execute on function billing.cancel_checkout_intent(text) to service_role;
grant execute on function billing.activate_verified_checkout(text, text, text, text, text, text, timestamptz, timestamptz) to service_role;
