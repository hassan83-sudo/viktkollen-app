-- Record which server instance may send one SumUp renewal charge.
-- A takeover is allowed only after the 900 second lease. That is longer than
-- the 30 second function limit configured in vercel.json and longer than
-- Vercel's standard 300 second function maximum, so a live invocation cannot
-- be charged a second time.
-- Prepared locally. Do not apply to Production until this migration is approved.
-- Does not store a payment instrument token or card data.
-- Does not replace the reservation function or grant table access.

create or replace function billing.claim_sumup_renewal_attempt(
  p_checkout_reference text,
  p_subscription_id text,
  p_period_end timestamptz,
  p_to_status text,
  p_provider_checkout_ref text,
  p_takeover boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  stored billing.sumup_renewal_attempts;
  checkout_ref text;
  claimed_count integer := 0;
  lease_open boolean;
begin
  checkout_ref := coalesce(p_provider_checkout_ref, '');
  if p_checkout_reference is null
     or p_checkout_reference !~ '^[A-Za-z0-9._:-]{1,64}$'
     or p_subscription_id is null
     or p_subscription_id !~ '^[A-Za-z0-9._:-]{1,80}$'
     or p_period_end is null
     or p_takeover is null
     or (p_to_status is distinct from 'created' and p_to_status is distinct from 'processing') then
    raise exception 'illegal_renewal_transition';
  end if;
  if checkout_ref <> '' and checkout_ref !~ '^[A-Za-z0-9._:-]{1,80}$' then
    raise exception 'illegal_renewal_transition';
  end if;

  select * into stored
  from billing.sumup_renewal_attempts attempt
  where attempt.checkout_reference = p_checkout_reference
  for update;
  if not found then
    raise exception 'renewal_attempt_not_found';
  end if;
  if stored.subscription_id is distinct from p_subscription_id
     or stored.period_end is distinct from p_period_end then
    raise exception 'renewal_attempt_conflict';
  end if;

  lease_open := stored.updated_at > pg_catalog.now() - interval '900 seconds';
  if p_takeover and lease_open then
    return pg_catalog.jsonb_build_object(
      'checkout_reference', stored.checkout_reference,
      'claimed', false,
      'provider_checkout_ref', stored.provider_checkout_ref,
      'status', stored.status,
      'takeover_allowed', false
    );
  end if;

  if p_to_status = 'created' then
    if stored.status in ('processing', 'succeeded', 'failed') then
      return pg_catalog.jsonb_build_object(
        'checkout_reference', stored.checkout_reference,
        'claimed', false,
        'provider_checkout_ref', stored.provider_checkout_ref,
        'status', stored.status,
        'takeover_allowed', false
      );
    end if;
    if stored.status = 'created' then
      if checkout_ref <> '' and stored.provider_checkout_ref is distinct from checkout_ref then
        raise exception 'renewal_attempt_conflict';
      end if;
      return pg_catalog.jsonb_build_object(
        'checkout_reference', stored.checkout_reference,
        'claimed', false,
        'provider_checkout_ref', stored.provider_checkout_ref,
        'status', stored.status,
        'takeover_allowed', true
      );
    end if;
    if stored.status is distinct from 'reserved' then
      raise exception 'illegal_renewal_transition';
    end if;
    if checkout_ref = '' then
      return pg_catalog.jsonb_build_object(
        'checkout_reference', stored.checkout_reference,
        'claimed', false,
        'provider_checkout_ref', '',
        'status', stored.status,
        'takeover_allowed', true
      );
    end if;
    update billing.sumup_renewal_attempts attempt
      set status = 'created',
          provider_checkout_ref = checkout_ref,
          updated_at = pg_catalog.now()
    where attempt.checkout_reference = p_checkout_reference
      and attempt.status = 'reserved'
      and (
        p_takeover = false
        or attempt.updated_at <= pg_catalog.now() - interval '900 seconds'
      )
    returning * into stored;
    get diagnostics claimed_count = row_count;
  else
    if stored.status in ('processing', 'succeeded', 'failed', 'reserved') then
      return pg_catalog.jsonb_build_object(
        'checkout_reference', stored.checkout_reference,
        'claimed', false,
        'provider_checkout_ref', stored.provider_checkout_ref,
        'status', stored.status,
        'takeover_allowed', false
      );
    end if;
    if stored.status is distinct from 'created' then
      raise exception 'illegal_renewal_transition';
    end if;
    if stored.provider_checkout_ref !~ '^[A-Za-z0-9._:-]{1,80}$' then
      raise exception 'illegal_renewal_transition';
    end if;
    if checkout_ref <> '' and checkout_ref is distinct from stored.provider_checkout_ref then
      raise exception 'renewal_attempt_conflict';
    end if;
    update billing.sumup_renewal_attempts attempt
      set status = 'processing',
          updated_at = pg_catalog.now()
    where attempt.checkout_reference = p_checkout_reference
      and attempt.status = 'created'
      and (
        p_takeover = false
        or attempt.updated_at <= pg_catalog.now() - interval '900 seconds'
      )
    returning * into stored;
    get diagnostics claimed_count = row_count;
  end if;

  if claimed_count = 1 then
    return pg_catalog.jsonb_build_object(
      'checkout_reference', stored.checkout_reference,
      'claimed', true,
      'provider_checkout_ref', stored.provider_checkout_ref,
      'status', stored.status,
      'takeover_allowed', true
    );
  end if;

  select * into stored
  from billing.sumup_renewal_attempts attempt
  where attempt.checkout_reference = p_checkout_reference;
  return pg_catalog.jsonb_build_object(
    'checkout_reference', stored.checkout_reference,
    'claimed', false,
    'provider_checkout_ref', stored.provider_checkout_ref,
    'status', stored.status,
    'takeover_allowed', false
  );
end;
$$;

create or replace function billing.finish_sumup_renewal_attempt(
  p_checkout_reference text,
  p_subscription_id text,
  p_period_end timestamptz,
  p_status text,
  p_provider_checkout_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  stored billing.sumup_renewal_attempts;
  checkout_ref text;
  next_ref text;
begin
  checkout_ref := coalesce(p_provider_checkout_ref, '');
  if p_checkout_reference is null
     or p_checkout_reference !~ '^[A-Za-z0-9._:-]{1,64}$'
     or p_subscription_id is null
     or p_subscription_id !~ '^[A-Za-z0-9._:-]{1,80}$'
     or p_period_end is null
     or (p_status is distinct from 'succeeded' and p_status is distinct from 'failed') then
    raise exception 'illegal_renewal_transition';
  end if;
  if checkout_ref <> '' and checkout_ref !~ '^[A-Za-z0-9._:-]{1,80}$' then
    raise exception 'illegal_renewal_transition';
  end if;

  select * into stored
  from billing.sumup_renewal_attempts attempt
  where attempt.checkout_reference = p_checkout_reference
  for update;
  if not found then
    raise exception 'renewal_attempt_not_found';
  end if;
  if stored.subscription_id is distinct from p_subscription_id
     or stored.period_end is distinct from p_period_end then
    raise exception 'renewal_attempt_conflict';
  end if;
  if checkout_ref <> ''
     and stored.provider_checkout_ref <> ''
     and stored.provider_checkout_ref is distinct from checkout_ref then
    raise exception 'renewal_attempt_conflict';
  end if;
  if stored.status = p_status then
    return pg_catalog.jsonb_build_object(
      'checkout_reference', stored.checkout_reference,
      'status', stored.status
    );
  end if;
  if stored.status in ('succeeded', 'failed') then
    raise exception 'renewal_attempt_conflict';
  end if;
  if stored.status not in ('reserved', 'created', 'processing') then
    raise exception 'illegal_renewal_transition';
  end if;

  next_ref := case
    when stored.provider_checkout_ref = '' then checkout_ref
    else stored.provider_checkout_ref
  end;
  update billing.sumup_renewal_attempts attempt
    set provider_checkout_ref = next_ref,
        status = p_status,
        updated_at = pg_catalog.now()
  where attempt.checkout_reference = p_checkout_reference
    and attempt.status = stored.status
  returning * into stored;
  if not found then
    raise exception 'illegal_renewal_transition';
  end if;
  return pg_catalog.jsonb_build_object(
    'checkout_reference', stored.checkout_reference,
    'status', stored.status
  );
end;
$$;

revoke all on function billing.claim_sumup_renewal_attempt(text, text, timestamptz, text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function billing.finish_sumup_renewal_attempt(text, text, timestamptz, text, text) from public, anon, authenticated, service_role;
grant execute on function billing.claim_sumup_renewal_attempt(text, text, timestamptz, text, text, boolean) to service_role;
grant execute on function billing.finish_sumup_renewal_attempt(text, text, timestamptz, text, text) to service_role;
