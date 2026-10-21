-- ONLY isolated Supabase branch mthgxqviniwbmtaeirlj
-- DO NOT run on Production or normal Staging.
-- Empty renewal attempts verified before preparing this script.
begin;
-- SOURCE: 20261021170000_sumup_renewal_facts_draft.sql
-- DRAFT ONLY. Do not apply to Staging or Production.
-- Renewal settlement must use immutable facts recorded BEFORE charging.
-- This schema is intentionally not wired to a charging worker.
alter table billing.sumup_renewal_attempts
  add column if not exists expected_customer_ref text,
  add column if not exists expected_amount_minor bigint,
  add column if not exists expected_currency text,
  add column if not exists expected_next_period_end timestamptz;

alter table billing.sumup_renewal_attempts
  add constraint sumup_renewal_expected_amount_positive
    check (expected_amount_minor is null or expected_amount_minor > 0),
  add constraint sumup_renewal_expected_currency_sek
    check (expected_currency is null or expected_currency = 'SEK'),
  add constraint sumup_renewal_expected_period_forward
    check (expected_next_period_end is null or expected_next_period_end > period_end);

-- No direct grants. Binding checkout IDs and snapshot values must be implemented
-- in a separate reviewed, privileged transaction before any charging is enabled.


-- SOURCE: 20261021184500_sumup_renewal_checkout_uniqueness_draft.sql
-- DRAFT ONLY. Do not apply to Staging or Production.
-- A SumUp checkout may settle exactly one renewal attempt.
-- A partial unique index permits unbound attempts (empty checkout reference)
-- but rejects any attempt to reuse a provider checkout for another renewal.
-- Deployment prerequisite: audit existing nonempty checkout references for duplicates.
create unique index if not exists sumup_renewal_provider_checkout_uidx
  on billing.sumup_renewal_attempts (provider_checkout_ref)
  where provider_checkout_ref <> '';

commit;
