-- SumUp Hosted Checkout, engångsköp (Sprint 2).
-- Apply to Staging first. DO NOT apply to Production before sandbox verification and approval.
--
-- * open_one_time_checkout: at most one payable checkout per user. Reuses an
--   open checkout for the same plan, refuses a second plan while one is open,
--   and refuses a purchase while the user has an open subscription.
-- * bind_hosted_checkout: stores the SumUp checkout id and hosted page URL.
-- * activate_verified_one_time_checkout: atomic activation after the server has
--   retrieved and verified a PAID checkout. The database computes exactly one
--   30-day period from the verified payment time. Repeated or concurrent calls
--   return the same subscription. Accepts a payment made before the checkout
--   expired even when the notification arrives later.
-- * expire_due_one_time_access: ends a one-time period whose end has passed
--   and moves the plan assignment back to the free plan.
-- Recurring setup (activate_verified_sumup_setup) is unchanged.

alter table billing.checkout_intents
  add column if not exists provider_hosted_url text not null default '';

alter table billing.checkout_intents
  drop constraint if exists checkout_intents_hosted_url_shape;
alter table billing.checkout_intents
  add constraint checkout_intents_hosted_url_shape check (
    provider_hosted_url = ''
    or provider_hosted_url ~ '^https://checkout\.sumup\.com/pay/[A-Za-z0-9_-]{1,128}$'
  );

create or replace function billing.expire_due_one_time_access(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  due billing.subscriptions;
  ended integer := 0;
begin
  if p_user_id is null then
    raise exception 'invalid_user_id';
  end if;
  for due in
    select s.*
    from billing.subscriptions s
    where s.user_id = p_user_id
      and s.status in ('TRIALING', 'ACTIVE')
      and s.cancel_at_period_end is true
      and s.current_period_end <= pg_catalog.now()
    order by s.subscription_id
    for update
  loop
    perform billing.finalize_open_subscription(due.subscription_id, 'expire:' || due.subscription_id);
    perform billing.sync_plan_assignment_from_subscription(due.subscription_id, 'expire-sync:' || due.subscription_id);
    ended := ended + 1;
  end loop;
  return ended;
end;
$$;

create or replace function billing.open_one_time_checkout(
  p_user_id uuid,
  p_plan_id text,
  p_provider text,
  p_ttl_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  open_intent billing.checkout_intents;
  created jsonb;
begin
  if p_user_id is null
     or p_plan_id is null
     or p_plan_id = 'plan.free'
     or p_provider is null
     or p_provider !~ '^[A-Za-z0-9._-]{1,40}$'
     or p_ttl_seconds is null
     or p_ttl_seconds not between 600 and 3600 then
    raise exception 'invalid_checkout_intent';
  end if;

  -- One purchase decision per user at a time.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('billing.checkout:' || p_user_id::text, 0));

  perform billing.expire_due_one_time_access(p_user_id);
  if exists (
    select 1 from billing.subscriptions s
    where s.user_id = p_user_id
      and s.status in ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED')
  ) then
    raise exception 'active_period_exists';
  end if;

  -- A checkout stays payable at SumUp until expires_at (valid_until). Two
  -- minutes are added for clock differences before a new one may be opened.
  select * into open_intent
  from billing.checkout_intents i
  where i.user_id = p_user_id
    and i.provider = p_provider
    and i.status = 'pending'
    and i.expires_at + interval '2 minutes' > pg_catalog.now()
  order by i.created_at desc
  limit 1;

  if found then
    if open_intent.plan_id is distinct from p_plan_id
       or open_intent.expires_at <= pg_catalog.now() + interval '5 minutes' then
      raise exception 'checkout_in_progress';
    end if;
    return pg_catalog.jsonb_build_object(
      'access_granted', false,
      'checkout_id', open_intent.checkout_id,
      'expires_at', open_intent.expires_at,
      'plan_id', open_intent.plan_id,
      'provider', open_intent.provider,
      'provider_checkout_ref', open_intent.provider_checkout_ref,
      'provider_hosted_url', open_intent.provider_hosted_url,
      'reused', true,
      'status', open_intent.status,
      'user_id', open_intent.user_id
    );
  end if;

  created := billing.create_checkout_intent(
    p_user_id,
    p_plan_id,
    p_provider,
    '',
    pg_catalog.now() + pg_catalog.make_interval(secs => p_ttl_seconds)
  );
  return created || pg_catalog.jsonb_build_object(
    'provider_checkout_ref', '',
    'provider_hosted_url', '',
    'reused', false
  );
end;
$$;

create or replace function billing.bind_hosted_checkout(
  p_checkout_id text,
  p_provider text,
  p_provider_checkout_ref text,
  p_hosted_url text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing billing.checkout_intents;
begin
  if p_hosted_url is null
     or p_hosted_url !~ '^https://checkout\.sumup\.com/pay/[A-Za-z0-9_-]{1,128}$' then
    raise exception 'invalid_checkout_ref';
  end if;
  -- Same checks and lock as the existing binding (pending, not expired, no other ref).
  perform billing.bind_provider_checkout_ref(p_checkout_id, p_provider, p_provider_checkout_ref);
  select * into existing
  from billing.checkout_intents
  where checkout_id = p_checkout_id
  for update;
  if existing.provider_hosted_url <> '' and existing.provider_hosted_url is distinct from p_hosted_url then
    raise exception 'provider_checkout_conflict';
  end if;
  update billing.checkout_intents
  set provider_hosted_url = p_hosted_url
  where checkout_id = p_checkout_id
  returning * into existing;
  return pg_catalog.jsonb_build_object(
    'access_granted', false,
    'checkout_id', existing.checkout_id,
    'plan_id', existing.plan_id,
    'provider', existing.provider,
    'provider_checkout_ref', existing.provider_checkout_ref,
    'provider_hosted_url', existing.provider_hosted_url,
    'status', existing.status,
    'user_id', existing.user_id
  );
end;
$$;

create or replace function billing.activate_verified_one_time_checkout(
  p_checkout_id text,
  p_provider text,
  p_provider_event_id text,
  p_provider_customer_ref text,
  p_provider_subscription_ref text,
  p_provider_checkout_ref text,
  p_paid_at timestamptz
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
  period_start timestamptz;
  period_end timestamptz;
begin
  if p_provider_event_id is null
     or p_provider_event_id !~ '^[A-Za-z0-9._:-]+$'
     or char_length(p_provider_event_id) > 120
     or p_provider_customer_ref is null
     or p_provider_customer_ref !~ '^[A-Za-z0-9._:-]{1,120}$'
     or p_provider_subscription_ref is null
     or p_provider_subscription_ref !~ '^[A-Za-z0-9._:-]{1,120}$'
     or p_provider_checkout_ref is null
     or p_provider_checkout_ref !~ '^[A-Za-z0-9._:-]{1,120}$'
     or p_paid_at is null
     or p_paid_at > pg_catalog.now() + interval '5 minutes' then
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
  if existing.provider_checkout_ref = ''
     or existing.provider_checkout_ref is distinct from p_provider_checkout_ref then
    raise exception 'provider_checkout_mismatch';
  end if;

  -- Exactly one period: retries and parallel callers get the stored result.
  if existing.status = 'consumed' then
    if existing.provider_event_id is distinct from p_provider_event_id then
      raise exception 'checkout_intent_consumed';
    end if;
    select * into created from billing.subscriptions where subscription_id = existing.subscription_id;
    if created.user_id is distinct from existing.user_id
       or created.plan_id is distinct from existing.plan_id
       or created.provider_subscription_ref is distinct from p_provider_subscription_ref then
      raise exception 'duplicate_external_event';
    end if;
    select * into assigned from billing.user_plan_assignments where user_id = existing.user_id;
    return pg_catalog.jsonb_build_object(
      'access_granted', true,
      'assignment_plan_id', assigned.plan_id,
      'current_period_end', created.current_period_end,
      'current_period_start', created.current_period_start,
      'plan_id', existing.plan_id,
      'status', created.status,
      'subscription_id', created.subscription_id,
      'user_id', existing.user_id
    );
  end if;
  if existing.status = 'cancelled' then
    raise exception 'checkout_intent_cancelled';
  end if;
  if existing.status <> 'pending' then
    raise exception 'checkout_intent_expired';
  end if;
  -- The payment must belong to this checkout's lifetime. A late notification
  -- for a payment made in time is still accepted.
  if p_paid_at < existing.created_at - interval '1 minute'
     or p_paid_at > existing.expires_at + interval '2 minutes' then
    raise exception 'checkout_intent_expired';
  end if;

  if exists (
    select 1 from billing.subscriptions stored
    where stored.provider = p_provider and stored.provider_subscription_ref = p_provider_subscription_ref
  ) or exists (
    select 1 from billing.checkout_intents other
    where other.provider_event_id = p_provider_event_id and other.checkout_id is distinct from existing.checkout_id
  ) then
    raise exception 'provider_subscription_conflict';
  end if;

  -- A finished one-time period must not block a new purchase.
  perform billing.expire_due_one_time_access(existing.user_id);

  period_start := p_paid_at;
  period_end := p_paid_at + interval '30 days';
  if period_end <= pg_catalog.now() then
    raise exception 'checkout_intent_expired';
  end if;

  created := billing.create_subscription(
    p_user_id => existing.user_id,
    p_plan_id => existing.plan_id,
    p_status => 'ACTIVE',
    p_period_start => period_start,
    p_period_end => period_end,
    p_cancel_at_period_end => true,
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
  where checkout_id = existing.checkout_id;

  return pg_catalog.jsonb_build_object(
    'access_granted', true,
    'assignment_plan_id', assigned.plan_id,
    'current_period_end', created.current_period_end,
    'current_period_start', created.current_period_start,
    'plan_id', existing.plan_id,
    'status', created.status,
    'subscription_id', created.subscription_id,
    'user_id', existing.user_id
  );
exception
  when unique_violation then
    raise exception 'provider_subscription_conflict';
end;
$$;

-- Read for the return view and webhook: identity, state and hosted URL only.
create or replace function billing.read_one_time_checkout(p_checkout_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing billing.checkout_intents;
begin
  if p_checkout_id is null or p_checkout_id !~ '^[A-Za-z0-9._:-]{1,80}$' then
    return null;
  end if;
  select * into existing from billing.checkout_intents where checkout_id = p_checkout_id and provider = 'sumup';
  if existing.checkout_id is null then
    return null;
  end if;
  return pg_catalog.jsonb_build_object(
    'checkout_id', existing.checkout_id,
    'created_at', existing.created_at,
    'expires_at', existing.expires_at,
    'plan_id', existing.plan_id,
    'provider', existing.provider,
    'provider_checkout_ref', existing.provider_checkout_ref,
    'status', existing.status,
    'user_id', existing.user_id
  );
end;
$$;

revoke all on function billing.expire_due_one_time_access(uuid) from public, anon, authenticated, service_role;
revoke all on function billing.open_one_time_checkout(uuid, text, text, integer) from public, anon, authenticated, service_role;
revoke all on function billing.bind_hosted_checkout(text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function billing.activate_verified_one_time_checkout(text, text, text, text, text, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function billing.read_one_time_checkout(text) from public, anon, authenticated, service_role;
grant execute on function billing.expire_due_one_time_access(uuid) to service_role;
grant execute on function billing.open_one_time_checkout(uuid, text, text, integer) to service_role;
grant execute on function billing.bind_hosted_checkout(text, text, text, text) to service_role;
grant execute on function billing.activate_verified_one_time_checkout(text, text, text, text, text, text, timestamptz) to service_role;
grant execute on function billing.read_one_time_checkout(text) to service_role;
