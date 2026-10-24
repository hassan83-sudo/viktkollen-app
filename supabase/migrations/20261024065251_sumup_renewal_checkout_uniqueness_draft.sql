-- DRAFT ONLY. Do not apply to Staging or Production.
-- A SumUp checkout may settle exactly one renewal attempt.
-- A partial unique index permits unbound attempts (empty checkout reference)
-- but rejects any attempt to reuse a provider checkout for another renewal.
-- Deployment prerequisite: audit existing nonempty checkout references for duplicates.
create unique index if not exists sumup_renewal_provider_checkout_uidx
  on billing.sumup_renewal_attempts (provider_checkout_ref)
  where provider_checkout_ref <> '';
