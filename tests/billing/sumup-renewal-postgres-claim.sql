-- Disposable PostgreSQL test only. No Supabase or SumUp calls.
do $test$
declare
  first_result jsonb;
  second_result jsonb;
  attempt_count integer;
begin
  select billing.claim_sumup_renewal_attempt(
    'renewal-claim-a', 'sub-1', '2026-10-01T00:00:00Z'::timestamptz
  ) into first_result;

  if first_result->>'claimed' is distinct from 'true'
     or first_result->>'checkout_reference' is distinct from 'renewal-claim-a'
     or first_result->>'status' is distinct from 'processing' then
    raise exception 'first eligible claim was not acquired: %', first_result;
  end if;

  select billing.claim_sumup_renewal_attempt(
    'renewal-claim-b', 'sub-1', '2026-10-01T00:00:00Z'::timestamptz
  ) into second_result;

  if second_result->>'claimed' is distinct from 'false'
     or second_result->>'checkout_reference' is distinct from 'renewal-claim-a' then
    raise exception 'duplicate period claim was not idempotently rejected: %', second_result;
  end if;

  select count(*) into attempt_count
  from billing.sumup_renewal_attempts
  where subscription_id = 'sub-1'
    and period_end = '2026-10-01T00:00:00Z'::timestamptz;

  if attempt_count <> 1 then
    raise exception 'expected exactly one claim row, found %', attempt_count;
  end if;

  insert into billing.subscriptions values (
    'sub-no-instrument', 'user-2', 'plan-1', 'sumup', 'ACTIVE', 'customer-2',
    1, false, '2026-10-01T00:00:00Z'
  );

  begin
    perform billing.claim_sumup_renewal_attempt(
      'renewal-no-instrument', 'sub-no-instrument',
      '2026-10-01T00:00:00Z'::timestamptz
    );
    raise exception 'missing recurring instrument unexpectedly accepted';
  exception when others then
    if sqlerrm <> 'renewal_instrument_missing' then
      raise;
    end if;
  end;
end;
$test$;

select 'renewal claim invariants passed' as result;
