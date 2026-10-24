-- Disposable PostgreSQL only. Exercises immutable checkout binding before charging.
do $test$
declare
  first_result jsonb;
  replay_result jsonb;
begin
  select billing.claim_sumup_renewal_attempt(
    'renewal-bind-1', 'sub-1', '2026-10-01T00:00:00Z'::timestamptz
  ) into first_result;

  if first_result->>'claimed' is distinct from 'true' then
    raise exception 'eligible renewal claim failed: %', first_result;
  end if;

  select billing.bind_sumup_renewal_checkout_draft(
    'renewal-bind-1', 'checkout-provider-1', 'sub-1',
    '2026-10-01T00:00:00Z'::timestamptz,
    '2026-11-01T00:00:00Z'::timestamptz
  ) into replay_result;

  if replay_result->>'bound' is distinct from 'true' then
    raise exception 'checkout binding failed: %', replay_result;
  end if;

  -- An exact retry is idempotent; a changed checkout cannot replace the bound one.
  select billing.bind_sumup_renewal_checkout_draft(
    'renewal-bind-1', 'checkout-provider-1', 'sub-1',
    '2026-10-01T00:00:00Z'::timestamptz,
    '2026-11-01T00:00:00Z'::timestamptz
  ) into replay_result;

  begin
    perform billing.bind_sumup_renewal_checkout_draft(
      'renewal-bind-1', 'checkout-provider-2', 'sub-1',
      '2026-10-01T00:00:00Z'::timestamptz,
      '2026-11-01T00:00:00Z'::timestamptz
    );
    raise exception 'different checkout unexpectedly rebound existing renewal';
  exception when others then
    if sqlerrm <> 'renewal_binding_conflict' then
      raise;
    end if;
  end;

  if not exists (
    select 1 from billing.sumup_renewal_attempts
    where checkout_reference = 'renewal-bind-1'
      and provider_checkout_ref = 'checkout-provider-1'
      and expected_customer_ref = 'customer-1'
      and expected_amount_minor = 1900
      and expected_currency = 'SEK'
      and expected_next_period_end = '2026-11-01T00:00:00Z'::timestamptz
      and status = 'processing'
  ) then
    raise exception 'immutable renewal facts were not persisted as expected';
  end if;
end;
$test$;

select 'renewal checkout binding invariants passed' as result;
