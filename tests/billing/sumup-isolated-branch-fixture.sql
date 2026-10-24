-- ISOLATED TEST BRANCH ONLY: mthgxqviniwbmtaeirlj
-- NEVER apply to main, Production, or ordinary Staging.
-- Creates an empty, minimal billing fixture; no customers, payments, or credentials.
-- Run only after checking the selected project ref in Supabase SQL Editor.
begin;
create schema if not exists billing;
revoke all on schema billing from public, anon, authenticated, service_role;
create table if not exists billing.plans (
  plan_id text primary key,
  price_minor integer not null,
  currency text not null,
  version integer not null,
  active boolean not null default true
);
create table if not exists billing.subscriptions (
  subscription_id text primary key,
  user_id text not null,
  plan_id text not null,
  provider text not null,
  status text not null,
  provider_customer_ref text,
  plan_version integer not null,
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz not null
);
create table if not exists billing.sumup_recurring_instruments (
  subscription_id text not null,
  user_id text not null,
  provider_customer_ref text not null,
  status text not null
);
create table if not exists billing.sumup_renewal_attempts (
  checkout_reference text primary key,
  subscription_id text not null,
  period_end timestamptz not null,
  provider_checkout_ref text not null default '',
  status text not null default 'processing'
);
revoke all on all tables in schema billing from public, anon, authenticated, service_role;
commit;
