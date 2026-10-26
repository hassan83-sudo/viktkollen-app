-- Disposable GitHub Actions PostgreSQL only. No Supabase connection.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema billing;
create table billing.plans (
 plan_id text primary key, price_minor integer not null, currency text not null, version integer not null, active boolean not null default true
);
create table billing.subscriptions (
 subscription_id text primary key, user_id text not null, plan_id text not null,
 provider text not null, status text not null, provider_customer_ref text,
 plan_version integer not null, cancel_at_period_end boolean not null default false,
 current_period_end timestamptz not null
);
create table billing.sumup_recurring_instruments (
 subscription_id text not null, user_id text not null,
 provider_customer_ref text not null, status text not null
);
create table billing.sumup_renewal_attempts (
 checkout_reference text primary key, subscription_id text not null,
 period_end timestamptz not null, provider_checkout_ref text not null default '',
 status text not null default 'processing'
);
create unique index sumup_attempts_period
  on billing.sumup_renewal_attempts (subscription_id, period_end);
alter table billing.sumup_recurring_instruments
 add column instrument_fingerprint text not null default repeat('a', 64);

insert into billing.plans values ('plan-1', 1900, 'SEK', 1);
insert into billing.subscriptions values (
 'sub-1', 'user-1', 'plan-1', 'sumup', 'ACTIVE', 'customer-1',
 1, false, '2026-10-01T00:00:00Z'
);
insert into billing.sumup_recurring_instruments values (
 'sub-1', 'user-1', 'customer-1', 'verified', repeat('a', 64)
);
