-- Exercises the real snapshot guard migration in a disposable database.
insert into billing.sumup_renewal_attempts
 (checkout_reference, subscription_id, period_end, provider_checkout_ref,
 expected_customer_ref, expected_amount_minor, expected_currency, expected_next_period_end)
values ('renewal-good', 'sub-1', '2026-10-01T00:00:00Z', 'checkout-good',
 'customer-1', 1900, 'SEK', '2026-11-01T00:00:00Z');

do $test$
begin
  begin
    update billing.sumup_renewal_attempts set expected_amount_minor = 1
      where checkout_reference = 'renewal-good';
    raise exception 'snapshot rewrite unexpectedly accepted';
  exception when raise_exception then
    if sqlerrm <> 'sumup_renewal_snapshot_immutable' then raise; end if;
  end;
  begin
    insert into billing.sumup_renewal_attempts
      (checkout_reference, subscription_id, period_end, provider_checkout_ref,
       expected_customer_ref, expected_amount_minor, expected_currency, expected_next_period_end)
    values ('renewal-wrong-price', 'sub-1', '2026-10-01T00:00:00Z', 'checkout-bad',
      'customer-1', 1, 'SEK', '2026-11-01T00:00:00Z');
    raise exception 'wrong price unexpectedly accepted';
  exception when raise_exception then
    if sqlerrm <> 'sumup_renewal_plan_price_mismatch' then raise; end if;
  end;
  begin
    insert into billing.sumup_renewal_attempts
      (checkout_reference, subscription_id, period_end, provider_checkout_ref,
       expected_customer_ref, expected_amount_minor, expected_currency, expected_next_period_end)
    values ('renewal-wrong-customer', 'sub-1', '2026-10-01T00:00:00Z', 'checkout-bad-2',
      'customer-other', 1900, 'SEK', '2026-11-01T00:00:00Z');
    raise exception 'wrong customer unexpectedly accepted';
  exception when raise_exception then
    if sqlerrm <> 'sumup_renewal_plan_price_mismatch' then raise; end if;
  end;
  if (select count(*) from billing.sumup_renewal_attempts) <> 1 then
    raise exception 'unexpected persisted renewal rows';
  end if;
end;
$test$;
