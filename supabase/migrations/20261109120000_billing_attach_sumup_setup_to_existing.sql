-- Attach a verified SumUp SETUP_RECURRING_PAYMENT mandate to an existing
-- open subscription without creating a new subscription or changing the period.
-- Local migration only. DO NOT apply to staging. DO NOT apply to production.
-- Reuses billing.bind_verified_sumup_instrument and billing.clear_cancel_at_period_end.
-- Does not open a new subscription row, sync a new assignment, charge SumUp, or
-- store card material. Allows consuming a still-pending intent after expires_at.

create or replace function billing.attach_verified_sumup_setup_to_existing(
  p_checkout_id text,
  p_subscription_id text,
  p_provider_event_id text,
  p_clear_cancel_event_id text,
  p_provider_customer_ref text,
  p_provider_checkout_ref text,
  p_instrument_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  existing_intent billing.checkout_intents;
  existing_subscription billing.subscriptions;
  updated_subscription billing.subscriptions;
  stored_instrument billing.sumup_recurring_instruments;
  period_start timestamptz;
  period_end timestamptz;
begin
  if p_checkout_id is null
     or p_checkout_id !~ '^[A-Za-z0-9._:-]{1,80}$'
     or p_subscription_id is null
     or p_subscription_id !~ '^[A-Za-z0-9._:-]{1,80}$'
     or p_provider_event_id is null
     or p_provider_event_id !~ '^[A-Za-z0-9._:-]+$'
     or char_length(p_provider_event_id) > 120
     or p_clear_cancel_event_id is null
     or p_clear_cancel_event_id !~ '^[A-Za-z0-9._:-]+$'
     or char_length(p_clear_cancel_event_id) > 120
     or p_provider_event_id = p_clear_cancel_event_id
     or p_provider_customer_ref is null
     or p_provider_customer_ref !~ '^vk[0-9a-f]{32}$'
     or p_provider_checkout_ref is null
     or p_provider_checkout_ref !~ '^[A-Za-z0-9._:-]{1,80}$'
     or p_instrument_fingerprint is null
     or p_instrument_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_provider_event';
  end if;

  select * into existing_intent
  from billing.checkout_intents
  where checkout_id = p_checkout_id
  for update;
  if not found then
    raise exception 'checkout_intent_missing';
  end if;
  if existing_intent.provider is distinct from 'sumup' then
    raise exception 'provider_mismatch';
  end if;
  if existing_intent.provider_checkout_ref = ''
     or existing_intent.provider_checkout_ref is distinct from p_provider_checkout_ref then
    raise exception 'provider_checkout_mismatch';
  end if;
  if p_provider_customer_ref is distinct from ('vk' || replace(existing_intent.user_id::text, '-', '')) then
    raise exception 'customer_mismatch';
  end if;

  select * into existing_subscription
  from billing.subscriptions
  where subscription_id = p_subscription_id
  for update;
  if not found then
    raise exception 'subscription_not_found';
  end if;
  if existing_subscription.user_id is distinct from existing_intent.user_id then
    raise exception 'subscription_user_mismatch';
  end if;
  if existing_subscription.plan_id is distinct from existing_intent.plan_id then
    raise exception 'checkout_binding_mismatch';
  end if;
  if existing_subscription.provider is distinct from 'sumup' then
    raise exception 'provider_mismatch';
  end if;
  if existing_subscription.provider_customer_ref is distinct from p_provider_customer_ref then
    raise exception 'customer_mismatch';
  end if;
  if existing_subscription.status is distinct from 'ACTIVE' then
    raise exception 'illegal_subscription_transition';
  end if;

  period_start := existing_subscription.current_period_start;
  period_end := existing_subscription.current_period_end;

  if existing_intent.status = 'consumed' then
    if existing_intent.provider_event_id is distinct from p_provider_event_id then
      raise exception 'checkout_intent_consumed';
    end if;
    if existing_intent.subscription_id is distinct from p_subscription_id then
      raise exception 'duplicate_external_event';
    end if;
    select * into stored_instrument
    from billing.sumup_recurring_instruments
    where subscription_id = p_subscription_id;
    if not found
       or stored_instrument.user_id is distinct from existing_intent.user_id
       or stored_instrument.instrument_fingerprint is distinct from p_instrument_fingerprint
       or stored_instrument.provider_customer_ref is distinct from p_provider_customer_ref
       or stored_instrument.setup_checkout_ref is distinct from p_provider_checkout_ref then
      raise exception 'instrument_conflict';
    end if;
    if existing_subscription.cancel_at_period_end is distinct from false then
      raise exception 'cancel_not_cleared';
    end if;
    if existing_subscription.current_period_start is distinct from period_start
       or existing_subscription.current_period_end is distinct from period_end then
      raise exception 'period_changed';
    end if;
    return pg_catalog.jsonb_build_object(
      'access_granted', true,
      'cancel_at_period_end', false,
      'current_period_end', existing_subscription.current_period_end,
      'current_period_start', existing_subscription.current_period_start,
      'instrument_bound', true,
      'plan_id', existing_intent.plan_id,
      'provider', existing_subscription.provider,
      'provider_customer_ref', existing_subscription.provider_customer_ref,
      'proration', false,
      'refund', false,
      'status', existing_subscription.status,
      'subscription_id', existing_subscription.subscription_id,
      'user_id', existing_intent.user_id
    );
  end if;

  if existing_intent.status = 'cancelled' then
    raise exception 'checkout_intent_cancelled';
  end if;
  -- Pending intents remain attachable after expires_at; only pending can become consumed.
  if existing_intent.status is distinct from 'pending' then
    raise exception 'checkout_intent_unconfirmed';
  end if;

  if exists (
    select 1
    from billing.checkout_intents other
    where other.provider_event_id = p_provider_event_id
      and other.checkout_id is distinct from existing_intent.checkout_id
  ) then
    raise exception 'provider_subscription_conflict';
  end if;

  perform billing.bind_verified_sumup_instrument(
    p_subscription_id => existing_subscription.subscription_id,
    p_user_id => existing_intent.user_id,
    p_provider_customer_ref => p_provider_customer_ref,
    p_instrument_fingerprint => p_instrument_fingerprint,
    p_setup_checkout_ref => p_provider_checkout_ref
  );

  select * into stored_instrument
  from billing.sumup_recurring_instruments
  where subscription_id = existing_subscription.subscription_id;
  if not found
     or stored_instrument.user_id is distinct from existing_intent.user_id
     or stored_instrument.instrument_fingerprint is distinct from p_instrument_fingerprint
     or stored_instrument.provider_customer_ref is distinct from p_provider_customer_ref
     or stored_instrument.setup_checkout_ref is distinct from p_provider_checkout_ref then
    raise exception 'instrument_bind_failed';
  end if;

  if existing_subscription.cancel_at_period_end is true then
    updated_subscription := billing.clear_cancel_at_period_end(
      p_subscription_id => existing_subscription.subscription_id,
      p_external_event_id => p_clear_cancel_event_id
    );
  else
    updated_subscription := existing_subscription;
  end if;

  if updated_subscription.subscription_id is distinct from existing_subscription.subscription_id
     or updated_subscription.cancel_at_period_end is distinct from false
     or updated_subscription.current_period_start is distinct from period_start
     or updated_subscription.current_period_end is distinct from period_end
     or updated_subscription.provider_customer_ref is distinct from p_provider_customer_ref
     or updated_subscription.plan_id is distinct from existing_intent.plan_id
     or updated_subscription.status is distinct from 'ACTIVE' then
    raise exception 'period_changed';
  end if;

  update billing.checkout_intents
  set
    consumed_at = pg_catalog.now(),
    provider_event_id = p_provider_event_id,
    status = 'consumed',
    subscription_id = existing_subscription.subscription_id
  where checkout_id = existing_intent.checkout_id
  returning * into existing_intent;

  return pg_catalog.jsonb_build_object(
    'access_granted', true,
    'cancel_at_period_end', false,
    'current_period_end', updated_subscription.current_period_end,
    'current_period_start', updated_subscription.current_period_start,
    'instrument_bound', true,
    'plan_id', existing_intent.plan_id,
    'provider', updated_subscription.provider,
    'provider_customer_ref', updated_subscription.provider_customer_ref,
    'proration', false,
    'refund', false,
    'status', updated_subscription.status,
    'subscription_id', updated_subscription.subscription_id,
    'user_id', existing_intent.user_id
  );
exception
  when unique_violation then
    raise exception 'provider_subscription_conflict';
end;
$$;

revoke all on function billing.attach_verified_sumup_setup_to_existing(text, text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function billing.attach_verified_sumup_setup_to_existing(text, text, text, text, text, text, text)
  to service_role;
