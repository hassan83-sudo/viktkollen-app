-- BILL-11F atomic SumUp initial activation.
-- Local migration only. DO NOT apply to staging. DO NOT apply to production.
-- One function creates the subscription, binds the instrument fingerprint,
-- syncs the plan assignment, and consumes the checkout intent.
-- A failed step rolls back with the function. Paid access is not returned early.
-- Does not replace billing.activate_verified_checkout or billing.bind_verified_sumup_instrument.
-- Does not store a SumUp token or card data.
-- Does not create public user entitlement rows.
-- Does not prorate or refund.

create or replace function billing.activate_verified_sumup_setup(
  p_checkout_id text,
  p_provider_event_id text,
  p_provider_customer_ref text,
  p_provider_subscription_ref text,
  p_provider_checkout_ref text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_instrument_fingerprint text
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
  stored_instrument billing.sumup_recurring_instruments;
begin
  if p_provider_event_id is null
     or p_provider_event_id !~ '^[A-Za-z0-9._:-]+$'
     or char_length(p_provider_event_id) > 120
     or p_provider_customer_ref is null
     or p_provider_customer_ref !~ '^vk[0-9a-f]{32}$'
     or p_provider_subscription_ref is null
     or p_provider_subscription_ref !~ '^[A-Za-z0-9._:-]{1,120}$'
     or p_provider_checkout_ref is null
     or p_provider_checkout_ref !~ '^[A-Za-z0-9._:-]{1,80}$'
     or p_period_end is null
     or p_period_start is null
     or p_period_end <= p_period_start then
    raise exception 'invalid_provider_event';
  end if;
  if p_instrument_fingerprint is null or p_instrument_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_recurring_instrument';
  end if;

  select * into existing
  from billing.checkout_intents
  where checkout_id = p_checkout_id
  for update;
  if not found then
    raise exception 'checkout_intent_missing';
  end if;
  if existing.provider is distinct from 'sumup' then
    raise exception 'provider_mismatch';
  end if;
  if existing.provider_checkout_ref = ''
     or existing.provider_checkout_ref is distinct from p_provider_checkout_ref then
    raise exception 'provider_checkout_mismatch';
  end if;
  if p_provider_customer_ref is distinct from ('vk' || replace(existing.user_id::text, '-', '')) then
    raise exception 'customer_mismatch';
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
       or created.provider is distinct from 'sumup'
       or created.provider_customer_ref is distinct from p_provider_customer_ref
       or created.provider_subscription_ref is distinct from p_provider_subscription_ref
       or created.current_period_start is distinct from p_period_start
       or created.current_period_end is distinct from p_period_end then
      raise exception 'duplicate_external_event';
    end if;
    select * into stored_instrument
    from billing.sumup_recurring_instruments
    where subscription_id = created.subscription_id;
    if not found
       or stored_instrument.user_id is distinct from existing.user_id
       or stored_instrument.instrument_fingerprint is distinct from p_instrument_fingerprint
       or stored_instrument.provider_customer_ref is distinct from p_provider_customer_ref
       or stored_instrument.setup_checkout_ref is distinct from p_provider_checkout_ref then
      raise exception 'instrument_conflict';
    end if;
    select * into assigned
    from billing.user_plan_assignments
    where user_id = existing.user_id;
    if not found or assigned.plan_id is distinct from existing.plan_id then
      raise exception 'assignment_sync_unconfirmed';
    end if;
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
    raise exception 'checkout_intent_expired';
  end if;

  if exists (
    select 1
    from billing.subscriptions stored
    where stored.provider = 'sumup'
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
    provider = 'sumup',
    provider_customer_ref = p_provider_customer_ref,
    provider_subscription_ref = p_provider_subscription_ref
  where subscription_id = created.subscription_id
    and provider = ''
    and provider_customer_ref = ''
    and provider_subscription_ref = ''
  returning * into created;
  if created.provider is distinct from 'sumup'
     or created.provider_subscription_ref is distinct from p_provider_subscription_ref then
    raise exception 'provider_subscription_conflict';
  end if;

  perform billing.bind_verified_sumup_instrument(
    p_subscription_id => created.subscription_id,
    p_user_id => existing.user_id,
    p_provider_customer_ref => p_provider_customer_ref,
    p_instrument_fingerprint => p_instrument_fingerprint,
    p_setup_checkout_ref => p_provider_checkout_ref
  );

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

revoke all on function billing.activate_verified_sumup_setup(text, text, text, text, text, timestamptz, timestamptz, text) from public, anon, authenticated, service_role;
grant execute on function billing.activate_verified_sumup_setup(text, text, text, text, text, timestamptz, timestamptz, text) to service_role;
