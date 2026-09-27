-- BILL-10B SumUp recurring foundation.
-- Local migration only. DO NOT apply to staging. DO NOT apply to production.
-- Stores a fingerprint of a verified payment instrument, never the token or card data.
-- Renewal attempts use a stable checkout reference so a retry does not create a second charge.

create table if not exists billing.sumup_recurring_instruments (
  subscription_id text primary key,
  user_id uuid not null,
  provider_customer_ref text not null,
  instrument_fingerprint text not null,
  setup_checkout_ref text not null,
  status text not null default 'verified',
  created_at timestamptz not null default pg_catalog.now(),
  verified_at timestamptz not null default pg_catalog.now(),
  constraint sumup_instruments_customer_token check (provider_customer_ref ~ '^[A-Za-z0-9._:-]{1,80}$'),
  constraint sumup_instruments_fingerprint check (instrument_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint sumup_instruments_setup_token check (setup_checkout_ref ~ '^[A-Za-z0-9._:-]{1,80}$'),
  constraint sumup_instruments_status check (status in ('verified'))
);

create unique index if not exists sumup_instruments_customer_uidx
  on billing.sumup_recurring_instruments (provider_customer_ref);

create unique index if not exists sumup_instruments_fingerprint_uidx
  on billing.sumup_recurring_instruments (instrument_fingerprint);

create table if not exists billing.sumup_renewal_attempts (
  checkout_reference text primary key,
  subscription_id text not null,
  period_end timestamptz not null,
  provider_checkout_ref text not null default '',
  status text not null default 'reserved',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint sumup_attempts_reference check (checkout_reference ~ '^[A-Za-z0-9._:-]{1,64}$'),
  constraint sumup_attempts_status check (status in ('reserved', 'created', 'processing', 'succeeded', 'failed')),
  constraint sumup_attempts_period unique (subscription_id, period_end)
);

alter table billing.sumup_recurring_instruments enable row level security;
alter table billing.sumup_recurring_instruments force row level security;
alter table billing.sumup_renewal_attempts enable row level security;
alter table billing.sumup_renewal_attempts force row level security;

revoke all on table billing.sumup_recurring_instruments from public, anon, authenticated, service_role;
revoke all on table billing.sumup_renewal_attempts from public, anon, authenticated, service_role;

drop policy if exists sumup_instruments_deny_all on billing.sumup_recurring_instruments;
create policy sumup_instruments_deny_all
on billing.sumup_recurring_instruments
as restrictive
for all
to public
using (false)
with check (false);

drop policy if exists sumup_attempts_deny_all on billing.sumup_renewal_attempts;
create policy sumup_attempts_deny_all
on billing.sumup_renewal_attempts
as restrictive
for all
to public
using (false)
with check (false);

create or replace function billing.bind_verified_sumup_instrument(
  p_subscription_id text,
  p_user_id uuid,
  p_provider_customer_ref text,
  p_instrument_fingerprint text,
  p_setup_checkout_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  stored billing.sumup_recurring_instruments;
begin
  if p_user_id is null
     or p_instrument_fingerprint !~ '^[0-9a-f]{64}$'
     or p_provider_customer_ref !~ '^[A-Za-z0-9._:-]{1,80}$' then
    raise exception 'invalid_recurring_instrument';
  end if;
  select * into stored
  from billing.sumup_recurring_instruments existing
  where existing.subscription_id = p_subscription_id;
  if found then
    if stored.user_id is distinct from p_user_id
       or stored.instrument_fingerprint is distinct from p_instrument_fingerprint
       or stored.provider_customer_ref is distinct from p_provider_customer_ref then
      raise exception 'instrument_conflict';
    end if;
  else
    insert into billing.sumup_recurring_instruments (
      instrument_fingerprint,
      provider_customer_ref,
      setup_checkout_ref,
      subscription_id,
      user_id
    ) values (
      p_instrument_fingerprint,
      p_provider_customer_ref,
      p_setup_checkout_ref,
      p_subscription_id,
      p_user_id
    )
    returning * into stored;
  end if;
  return pg_catalog.jsonb_build_object(
    'access_granted', false,
    'status', stored.status,
    'subscription_id', stored.subscription_id,
    'user_id', stored.user_id
  );
exception
  when unique_violation then
    raise exception 'instrument_conflict';
end;
$$;

create or replace function billing.reserve_sumup_renewal_attempt(
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
  stored billing.sumup_renewal_attempts;
begin
  insert into billing.sumup_renewal_attempts (
    checkout_reference,
    period_end,
    subscription_id
  ) values (
    p_checkout_reference,
    p_period_end,
    p_subscription_id
  )
  on conflict (checkout_reference) do nothing;
  select * into stored
  from billing.sumup_renewal_attempts
  where checkout_reference = p_checkout_reference;
  if stored.subscription_id is distinct from p_subscription_id
     or stored.period_end is distinct from p_period_end then
    raise exception 'renewal_attempt_conflict';
  end if;
  return pg_catalog.jsonb_build_object(
    'checkout_reference', stored.checkout_reference,
    'status', stored.status
  );
end;
$$;

revoke all on function billing.bind_verified_sumup_instrument(text, uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function billing.reserve_sumup_renewal_attempt(text, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function billing.bind_verified_sumup_instrument(text, uuid, text, text, text) to service_role;
grant execute on function billing.reserve_sumup_renewal_attempt(text, text, timestamptz) to service_role;
