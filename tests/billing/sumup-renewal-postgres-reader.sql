-- Runs only against disposable GitHub Actions PostgreSQL.
-- The previous guard test inserted the valid, bound attempt.
do $test$
declare
  facts record;
begin
  select * into facts from billing.read_sumup_renewal_facts_draft(
    'sub-1', '2026-10-01T00:00:00Z'
  );
  if not found or facts.checkout_reference <> 'renewal-good'
     or facts.provider_checkout_ref <> 'checkout-good'
     or facts.customer_id <> 'customer-1'
     or facts.amount_minor <> 1900
     or facts.currency <> 'SEK' then
    raise exception 'valid renewal facts were not returned correctly';
  end if;

  update billing.sumup_recurring_instruments set status = 'revoked';
  if exists (select 1 from billing.read_sumup_renewal_facts_draft(
    'sub-1', '2026-10-01T00:00:00Z')) then
    raise exception 'revoked instrument was accepted';
  end if;
  update billing.sumup_recurring_instruments set status = 'verified';

  update billing.subscriptions set cancel_at_period_end = true;
  if exists (select 1 from billing.read_sumup_renewal_facts_draft(
    'sub-1', '2026-10-01T00:00:00Z')) then
    raise exception 'cancelled subscription was accepted';
  end if;
  update billing.subscriptions set cancel_at_period_end = false;

  update billing.sumup_renewal_attempts set status = 'failed'
    where checkout_reference = 'renewal-good';
  if exists (select 1 from billing.read_sumup_renewal_facts_draft(
    'sub-1', '2026-10-01T00:00:00Z')) then
    raise exception 'failed attempt was accepted';
  end if;
  update billing.sumup_renewal_attempts set status = 'processing'
    where checkout_reference = 'renewal-good';

  if exists (select 1 from billing.read_sumup_renewal_facts_draft(
    'sub-1', '2026-09-01T00:00:00Z')) then
    raise exception 'wrong renewal period was accepted';
  end if;
end;
$test$;
