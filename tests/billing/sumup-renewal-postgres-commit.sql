-- Isolated PostgreSQL tests: actual renewal commit migration, mock advance RPC.
insert into billing.sumup_renewal_attempts
 (checkout_reference, subscription_id, period_end, provider_checkout_ref,
 expected_customer_ref, expected_amount_minor, expected_currency, expected_next_period_end)
values ('renewal-commit', 'sub-1', '2026-10-01T00:00:00Z', 'checkout-commit',
 'customer-1', 1900, 'SEK', '2026-11-01T00:00:00Z');

do $test$
declare result jsonb;
begin
  begin
    perform billing.commit_verified_sumup_renewal(
      'renewal-commit', 'sub-1', '2026-10-01T00:00:00Z',
      'wrong-checkout', '2026-11-01T00:00:00Z'
    );
    raise exception 'wrong checkout unexpectedly committed';
  exception when raise_exception then
    if sqlerrm <> 'renewal_commit_conflict' then raise; end if;
  end;
  if (select current_period_end from billing.subscriptions where subscription_id = 'sub-1')
     <> '2026-10-01T00:00:00Z'::timestamptz then
    raise exception 'failed verification changed subscription period';
  end if;

  result := billing.commit_verified_sumup_renewal(
    'renewal-commit', 'sub-1', '2026-10-01T00:00:00Z',
    'checkout-commit', '2026-11-01T00:00:00Z'
  );
  if result->>'committed' <> 'true'
     or (select current_period_end from billing.subscriptions where subscription_id = 'sub-1')
        <> '2026-11-01T00:00:00Z'::timestamptz
     or (select status from billing.sumup_renewal_attempts where checkout_reference = 'renewal-commit')
        <> 'succeeded' then
    raise exception 'renewal did not commit atomically';
  end if;

  result := billing.commit_verified_sumup_renewal(
    'renewal-commit', 'sub-1', '2026-10-01T00:00:00Z',
    'checkout-commit', '2026-11-01T00:00:00Z'
  );
  if result->>'already_committed' <> 'true' then
    raise exception 'repeat renewal was not idempotent';
  end if;
end;
$test$;
