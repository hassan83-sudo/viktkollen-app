-- BILL-10D repair for the SumUp recurring foundation.
-- Local migration only. DO NOT apply to staging. DO NOT apply to production.
-- Does not store a payment instrument token or card data.
-- Does not drop the renewal uniqueness constraints or weaken RLS.

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
exception
  when unique_violation then
    raise exception 'renewal_attempt_conflict';
end;
$$;

create or replace function billing.mark_sumup_renewal_attempt_processing(
  p_checkout_reference text,
  p_subscription_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  stored billing.sumup_renewal_attempts;
begin
  if p_checkout_reference is null or p_subscription_id is null or char_length(p_checkout_reference) = 0 then
    raise exception 'renewal_attempt_not_found';
  end if;
  select * into stored
  from billing.sumup_renewal_attempts attempt
  where attempt.checkout_reference = p_checkout_reference
  for update;
  if not found then
    raise exception 'renewal_attempt_not_found';
  end if;
  if stored.subscription_id is distinct from p_subscription_id then
    raise exception 'renewal_attempt_conflict';
  end if;
  if stored.status = 'processing' then
    return pg_catalog.jsonb_build_object(
      'checkout_reference', stored.checkout_reference,
      'status', stored.status
    );
  end if;
  if stored.status is distinct from 'reserved' then
    raise exception 'illegal_renewal_transition';
  end if;
  update billing.sumup_renewal_attempts attempt
  set status = 'processing',
      updated_at = pg_catalog.now()
  where attempt.checkout_reference = p_checkout_reference
    and attempt.subscription_id = p_subscription_id
    and attempt.status = 'reserved'
  returning * into stored;
  if not found then
    raise exception 'illegal_renewal_transition';
  end if;
  return pg_catalog.jsonb_build_object(
    'checkout_reference', stored.checkout_reference,
    'status', stored.status
  );
end;
$$;

create or replace function billing.cleanup_disposable_test_subscription(
  p_subscription_id text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  marker billing.disposable_test_subscriptions;
  target billing.subscriptions;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not_allowed';
  end if;
  if p_subscription_id is null or char_length(p_subscription_id) = 0 then
    raise exception 'disposable_fixture_not_found';
  end if;

  select d.* into marker
  from billing.disposable_test_subscriptions d
  where d.subscription_id = p_subscription_id
  for update;
  if not found then
    raise exception 'disposable_fixture_not_found';
  end if;

  perform s.subscription_id
  from billing.subscriptions s
  where s.user_id = marker.user_id
  order by s.subscription_id
  for update;

  select d.* into marker
  from billing.disposable_test_subscriptions d
  where d.subscription_id = p_subscription_id
  for update;
  if not found then
    raise exception 'disposable_fixture_not_found';
  end if;

  select s.* into target
  from billing.subscriptions s
  where s.subscription_id = p_subscription_id;
  if not found or target.user_id is distinct from marker.user_id then
    raise exception 'disposable_fixture_unsafe';
  end if;

  if exists (
    select 1
    from billing.subscriptions s
    where s.user_id = marker.user_id
      and not exists (
        select 1
        from billing.disposable_test_subscriptions d
        where d.subscription_id = s.subscription_id
      )
  ) then
    raise exception 'disposable_fixture_unsafe';
  end if;

  if exists (
    select 1 from billing.quota_reservations q where q.user_id = marker.user_id
  ) or exists (
    select 1 from billing.quota_period_locks q where q.user_id = marker.user_id
  ) or exists (
    select 1 from billing.usage_events u where u.user_id = marker.user_id
  ) then
    raise exception 'disposable_fixture_unsafe';
  end if;

  delete from billing.user_plan_assignment_events e
  where e.subscription_id = target.subscription_id;

  delete from billing.subscription_events e
  where e.subscription_id = target.subscription_id;

  delete from billing.user_plan_assignments a
  where a.user_id = target.user_id
    and not exists (
      select 1
      from billing.subscriptions s
      where s.user_id = target.user_id
        and s.subscription_id is distinct from target.subscription_id
    );

  delete from billing.sumup_renewal_attempts a
  where a.subscription_id = target.subscription_id;

  delete from billing.sumup_recurring_instruments i
  where i.subscription_id = target.subscription_id;

  perform pg_catalog.set_config('billing.disposable_cleanup_subscription_id', target.subscription_id, true);
  begin
    delete from billing.subscriptions s
    where s.subscription_id = target.subscription_id;
    delete from billing.disposable_test_subscriptions d
    where d.subscription_id = target.subscription_id;
    perform pg_catalog.set_config('billing.disposable_cleanup_subscription_id', '', true);
  exception
    when others then
      perform pg_catalog.set_config('billing.disposable_cleanup_subscription_id', '', true);
      raise;
  end;
end;
$$;

revoke all on function billing.reserve_sumup_renewal_attempt(text, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function billing.mark_sumup_renewal_attempt_processing(text, text) from public, anon, authenticated, service_role;
revoke all on function billing.cleanup_disposable_test_subscription(text) from public, anon, authenticated, service_role;
grant execute on function billing.reserve_sumup_renewal_attempt(text, text, timestamptz) to service_role;
grant execute on function billing.mark_sumup_renewal_attempt_processing(text, text) to service_role;
grant execute on function billing.cleanup_disposable_test_subscription(text) to service_role;
