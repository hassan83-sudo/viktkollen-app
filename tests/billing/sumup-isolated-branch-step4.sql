-- ONLY isolated Supabase test branch mthgxqviniwbmtaeirlj.
-- Minimal TEST-ONLY substitute for billing.advance_subscription_period.
-- NOT production billing logic; no customer charging or live integration.
begin;
alter table billing.sumup_renewal_attempts add column if not exists updated_at timestamptz not null default now();
create unique index if not exists sumup_renewal_one_attempt_per_period_test_uidx
  on billing.sumup_renewal_attempts (subscription_id, period_end);
create or replace function billing.advance_subscription_period(
  p_subscription_id text, p_period_end timestamptz, p_external_event_id text
) returns billing.subscriptions language plpgsql security definer
set search_path = pg_catalog, pg_temp as $test$
declare result billing.subscriptions;
begin
  if p_external_event_id is null or p_external_event_id !~ '^sumup_[A-Za-z0-9._:-]{1,64}$' then
    raise exception 'invalid_test_event_id';
  end if;
  update billing.subscriptions s
     set current_period_end = p_period_end, status = 'ACTIVE'
   where s.subscription_id = p_subscription_id
     and s.current_period_end < p_period_end
     and s.status in ('ACTIVE','PAST_DUE')
  returning * into result;
  if not found then raise exception 'test_period_not_advanced'; end if;
  return result;
end;
$test$;
revoke all on function billing.advance_subscription_period(text,timestamptz,text)
  from public, anon, authenticated, service_role;
commit;

-- SOURCE: 20261021140000_sumup_renewal_claim_draft.sql
-- Draft only. NOT APPROVED FOR STAGING OR PRODUCTION.
-- A claim is an exclusive one-time permission to attempt a renewal.
-- A lost worker must be reconciled with SumUp; do not re-claim automatically.
create or replace function billing.claim_sumup_renewal_attempt(
  p_checkout_reference text,
  p_subscription_id text,
  p_period_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  attempt billing.sumup_renewal_attempts;
  subscription billing.subscriptions;
begin
  if p_checkout_reference is null or p_checkout_reference !~ '^[A-Za-z0-9._:-]{1,64}$'
     or p_subscription_id is null or p_period_end is null then
    raise exception 'invalid_renewal_claim';
  end if;

  select * into subscription
  from billing.subscriptions s
  where s.subscription_id = p_subscription_id
  for update;

  if not found or subscription.provider is distinct from 'sumup'
     or subscription.status not in ('ACTIVE', 'PAST_DUE')
     or subscription.cancel_at_period_end
     or subscription.current_period_end is distinct from p_period_end
     or subscription.current_period_end > pg_catalog.now() then
    raise exception 'renewal_not_eligible';
  end if;

  if not exists (
    select 1 from billing.sumup_recurring_instruments i
    where i.subscription_id = p_subscription_id
      and i.user_id = subscription.user_id
      and i.status = 'verified'
  ) then
    raise exception 'renewal_instrument_missing';
  end if;

  insert into billing.sumup_renewal_attempts
    (checkout_reference, subscription_id, period_end, status)
  values (p_checkout_reference, p_subscription_id, p_period_end, 'processing')
  on conflict (subscription_id, period_end) do nothing
  returning * into attempt;

  if found then
    return pg_catalog.jsonb_build_object(
      'claimed', true,
      'checkout_reference', attempt.checkout_reference,
      'status', attempt.status
    );
  end if;

  select * into attempt from billing.sumup_renewal_attempts a
  where a.subscription_id = p_subscription_id and a.period_end = p_period_end;

  return pg_catalog.jsonb_build_object(
    'claimed', false,
    'checkout_reference', attempt.checkout_reference,
    'status', attempt.status
  );
end;
$$;

revoke all on function billing.claim_sumup_renewal_attempt(text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function billing.claim_sumup_renewal_attempt(text, text, timestamptz)
  to service_role;


-- SOURCE: 20261021160000_sumup_renewal_commit_draft.sql
-- DRAFT ONLY. DO NOT APPLY TO STAGING OR PRODUCTION.
-- PAID cannot be attested by SQL alone; this RPC stays inaccessible until
-- a privileged verification boundary and restricted execution role exist.
-- A successful RPC atomically advances the period and finalizes its attempt.
create or replace function billing.commit_verified_sumup_renewal(
  p_checkout_reference text,
  p_subscription_id text,
  p_period_end timestamptz,
  p_provider_checkout_ref text,
  p_next_period_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  attempt billing.sumup_renewal_attempts;
  subscription billing.subscriptions;
  updated billing.subscriptions;
begin
  if p_checkout_reference is null or p_checkout_reference !~ '^[A-Za-z0-9._:-]{1,64}$'
     or p_provider_checkout_ref is null or p_provider_checkout_ref !~ '^[A-Za-z0-9._:-]{1,80}$'
     or p_subscription_id is null or p_period_end is null or p_next_period_end is null
     or p_next_period_end <= p_period_end then
    raise exception 'invalid_renewal_commit';
  end if;

  select * into subscription from billing.subscriptions s
  where s.subscription_id = p_subscription_id for update;
  if not found or subscription.provider is distinct from 'sumup' then
    raise exception 'renewal_subscription_invalid';
  end if;

  select * into attempt from billing.sumup_renewal_attempts a
  where a.subscription_id = p_subscription_id and a.period_end = p_period_end
  for update;
  if not found or attempt.checkout_reference is distinct from p_checkout_reference then
    raise exception 'renewal_attempt_conflict';
  end if;

  if attempt.status = 'succeeded' then
    if attempt.provider_checkout_ref is distinct from p_provider_checkout_ref
       or attempt.expected_next_period_end is distinct from p_next_period_end
       or subscription.current_period_end < p_next_period_end then
      raise exception 'renewal_commit_conflict';
    end if;
    return pg_catalog.jsonb_build_object('committed', false, 'already_committed', true);
  end if;

  if attempt.status <> 'processing'
     or attempt.provider_checkout_ref is distinct from p_provider_checkout_ref
     or attempt.provider_checkout_ref = ''
     or attempt.expected_next_period_end is distinct from p_next_period_end
     or attempt.expected_customer_ref is null
     or attempt.expected_amount_minor is null
     or attempt.expected_amount_minor <= 0
     or attempt.expected_currency is distinct from 'SEK'
     or subscription.current_period_end is distinct from p_period_end
     or subscription.status not in ('ACTIVE', 'PAST_DUE')
     or subscription.cancel_at_period_end
     or not exists (
       select 1 from billing.plans p
       where p.plan_id = subscription.plan_id
         and p.active = true
         and p.version = subscription.plan_version
         and p.price_minor = attempt.expected_amount_minor
         and p.currency = attempt.expected_currency
     )
     or not exists (
       select 1 from billing.sumup_recurring_instruments i
       where i.subscription_id = subscription.subscription_id
         and i.user_id = subscription.user_id
         and i.provider_customer_ref = attempt.expected_customer_ref
         and i.status = 'verified'
     ) then
    raise exception 'renewal_commit_conflict';
  end if;

  updated := billing.advance_subscription_period(
    p_subscription_id, p_next_period_end, 'sumup_' || p_checkout_reference
  );
  if updated.current_period_end is distinct from p_next_period_end then
    raise exception 'renewal_period_not_advanced';
  end if;

  update billing.sumup_renewal_attempts
  set status = 'succeeded',
      provider_checkout_ref = p_provider_checkout_ref,
      updated_at = pg_catalog.now()
  where checkout_reference = p_checkout_reference;

  return pg_catalog.jsonb_build_object('committed', true, 'already_committed', false);
end;
$$;

revoke all on function billing.commit_verified_sumup_renewal(text, text, timestamptz, text, timestamptz)
  from public, anon, authenticated, service_role;
-- Intentionally NO execute grant. Never expose this commit RPC via service_role.
-- Verification must be enforced at the privileged boundary before enabling it.

