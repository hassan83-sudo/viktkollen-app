-- One-time hosted SumUp checkout: paid access expires without renewal.
-- Apply to staging and production only after verifying checkout/webhook tests.
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

