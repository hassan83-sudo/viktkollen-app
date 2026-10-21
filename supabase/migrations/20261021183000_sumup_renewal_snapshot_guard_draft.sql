-- DRAFT ONLY. DO NOT APPLY TO STAGING OR PRODUCTION.
-- Once a SumUp checkout has been bound to an attempt, neither its identity
-- nor its authoritative price/customer/period snapshot may be changed.
-- The first binding must be done by a separately reviewed trusted operation
-- which derives amount from server-side plan pricing, never client input.

create or replace function billing.prevent_sumup_renewal_snapshot_rewrite()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if old.provider_checkout_ref <> '' then
    if new.provider_checkout_ref is distinct from old.provider_checkout_ref
       or new.checkout_reference is distinct from old.checkout_reference
       or new.subscription_id is distinct from old.subscription_id
       or new.period_end is distinct from old.period_end
       or new.expected_customer_ref is distinct from old.expected_customer_ref
       or new.expected_amount_minor is distinct from old.expected_amount_minor
       or new.expected_currency is distinct from old.expected_currency
       or new.expected_next_period_end is distinct from old.expected_next_period_end then
      raise exception 'sumup_renewal_snapshot_immutable';
    end if;
  end if;

  if new.provider_checkout_ref <> '' then
    if new.expected_customer_ref is null or new.expected_customer_ref = ''
       or new.expected_amount_minor is null or new.expected_amount_minor <= 0
       or new.expected_currency is distinct from 'SEK'
       or new.expected_next_period_end is null
       or new.expected_next_period_end <= new.period_end then
      raise exception 'sumup_renewal_snapshot_incomplete';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sumup_renewal_snapshot_guard
  on billing.sumup_renewal_attempts;

create trigger sumup_renewal_snapshot_guard
before insert or update on billing.sumup_renewal_attempts
for each row execute function billing.prevent_sumup_renewal_snapshot_rewrite();

revoke all on function billing.prevent_sumup_renewal_snapshot_rewrite()
  from public, anon, authenticated, service_role;
