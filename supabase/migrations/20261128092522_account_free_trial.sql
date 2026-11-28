-- #210. No existing subscription, payment instrument, paid quota or credit is changed.
-- The trial is a separate plan snapshot, using the existing TRIALING lifecycle
-- and the atomic subscription quota window. Nature already reserves food.scan.
insert into billing.plans (plan_id, name, price_minor, currency, billing_interval, active, display_order, version, price_status)
select 'plan.trial.30days', '30 dagar gratis', 0, currency, billing_interval, true, 15, version, price_status
from billing.plans where plan_id = 'plan.prelim.sek.month.12'
on conflict (plan_id) do nothing;

insert into billing.plan_entitlements (plan_id, feature, enabled, limit_kind, limit_value, unit, quota_status)
select 'plan.trial.30days', feature, enabled,
  case when feature in ('food.scan', 'ai.nature.identification') then 'NUMBER' else limit_kind end,
  case when feature in ('food.scan', 'ai.nature.identification') then 5 else limit_value end,
  unit, quota_status
from billing.plan_entitlements where plan_id = 'plan.prelim.sek.month.12'
on conflict (plan_id, feature) do nothing;

create table billing.account_trials (
  user_id uuid primary key,
  subscription_id text not null unique references billing.subscriptions(subscription_id) on delete restrict,
  started_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at = started_at + interval '720 hours')
);
alter table billing.account_trials enable row level security;
create policy account_trials_no_client_access on billing.account_trials
  as restrictive for all to public using (false) with check (false);
revoke all on billing.account_trials from public, anon, authenticated, service_role;
grant select on billing.account_trials to service_role;

create function billing.start_account_trial(p_user_id uuid)
returns billing.subscriptions
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  created billing.subscriptions;
  at_time timestamptz := pg_catalog.now();
begin
  -- Identity must come from the verified server session, never the request body.
  if p_user_id is null or not exists (
    select 1 from auth.users u where u.id = p_user_id
      and coalesce(u.email, '') <> '' and coalesce(u.encrypted_password, '') <> ''
      and coalesce(u.is_anonymous, false) = false
  ) then raise exception 'email_password_required'; end if;

  -- Same purchase lock as open_one_time_checkout; no trial alongside a payable checkout.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('billing.checkout:' || p_user_id::text, 0));
  if exists (select 1 from billing.account_trials where user_id = p_user_id)
     or exists (select 1 from billing.subscriptions where user_id = p_user_id and status = 'TRIALING')
  then raise exception 'trial_already_used'; end if;
  if exists (select 1 from billing.checkout_intents where user_id = p_user_id
    and status = 'pending' and expires_at + interval '2 minutes' > at_time)
  then raise exception 'checkout_in_progress'; end if;

  -- Do not terminalize, overwrite or reschedule any existing subscription.
  if exists (select 1 from billing.subscriptions where user_id = p_user_id
    and status in ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED'))
  then raise exception 'active_period_exists'; end if;
  created := billing.create_subscription(
    p_user_id => p_user_id, p_plan_id => 'plan.trial.30days', p_status => 'TRIALING',
    p_period_start => at_time, p_period_end => at_time + interval '720 hours',
    p_cancel_at_period_end => true, p_external_event_id => 'trial:' || p_user_id::text
  );
  update billing.subscriptions set quota_window = 'subscription'
    where subscription_id = created.subscription_id returning * into created;
  insert into billing.account_trials values (p_user_id, created.subscription_id, at_time, at_time + interval '720 hours');
  perform billing.sync_plan_assignment_from_subscription(created.subscription_id, 'trial-sync:' || p_user_id::text);
  return created;
end;
$$;
revoke all on function billing.start_account_trial(uuid) from public, anon, authenticated, service_role;
grant execute on function billing.start_account_trial(uuid) to service_role;

-- Serialize the plan decision with explicit trial activation. The original
-- reservation/commit/rollback accounting remains unchanged, including credits.
-- A waiting request must read the assignment AFTER the trial has started.
alter function billing.reserve_quota(uuid,text,text,integer,text) rename to reserve_quota_before_account_trial;
revoke all on function billing.reserve_quota_before_account_trial(uuid,text,text,integer,text) from public, anon, authenticated, service_role;
create function billing.reserve_quota(p_user_id uuid, p_feature text, p_unit text, p_quantity integer, p_reservation_id text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$ begin
  if p_user_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('billing.checkout:' || p_user_id::text, 0));
  end if;
  return billing.reserve_quota_before_account_trial(p_user_id, p_feature, p_unit, p_quantity, p_reservation_id);
end; $$;
revoke all on function billing.reserve_quota(uuid,text,text,integer,text) from public, anon, authenticated, service_role;
grant execute on function billing.reserve_quota(uuid,text,text,integer,text) to service_role;

-- Sale eligibility only: historical plans, credits and running renewals remain intact.
-- Reuse the existing commercial-control read; do not change payment/renewal RPCs.
create or replace function billing.plan_enabled_for_sale(p_plan_id text)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select p_plan_id = 'plan.prelim.sek.month.12' and coalesce((
    select enabled_for_sale from billing.plan_commercial_controls where plan_id = p_plan_id
  ), true);
$$;
revoke all on function billing.plan_enabled_for_sale(text) from public, anon, authenticated, service_role;
grant execute on function billing.plan_enabled_for_sale(text) to service_role;

-- The cloud wardrobe is protected at the data boundary as well as in the UI.
-- This schema is not exposed through PostgREST. Callers can only test themselves.
create schema if not exists app_access;
revoke all on schema app_access from public, anon;
grant usage on schema app_access to authenticated;
create function app_access.subscription_allowed()
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from billing.subscriptions s
    where s.user_id = auth.uid() and s.plan_id <> 'plan.free'
      and s.current_period_start <= pg_catalog.now() and s.current_period_end > pg_catalog.now()
      and (s.status in ('TRIALING','ACTIVE')
        or (s.status = 'PAST_DUE' and s.past_due_grace_until > pg_catalog.now()))
  );
$$;
revoke all on function app_access.subscription_allowed() from public, anon, authenticated, service_role;
grant execute on function app_access.subscription_allowed() to authenticated;
do $$ begin
  if to_regclass('public.user_wardrobes') is not null then
    execute 'alter table public.user_wardrobes enable row level security';
    execute 'create policy wardrobe_subscription_required on public.user_wardrobes as restrictive for all to authenticated
      using (app_access.subscription_allowed()) with check (app_access.subscription_allowed())';
  end if;
end $$;

-- Customer support is an existing subscription feature too. Keep the paid
-- predicate unchanged and include only a live, explicitly activated trial.
do $$ begin
  if to_regprocedure('support.paid_eligible(uuid)') is not null then
    execute $fn$
      create or replace function support.paid_eligible(p_user uuid) returns boolean
      language sql stable security invoker set search_path = '' as $body$
        select exists (
          select 1 from billing.subscriptions s join billing.plans p on p.plan_id = s.plan_id
          where s.user_id = p_user and s.current_period_start <= pg_catalog.now() and s.current_period_end > pg_catalog.now()
            and ((p.price_minor > 0 and (s.status = 'ACTIVE' or (s.status = 'PAST_DUE' and s.past_due_grace_until > pg_catalog.now())))
              or (s.plan_id = 'plan.trial.30days' and s.status = 'TRIALING'))
        );
      $body$
    $fn$;
  end if;
end $$;
