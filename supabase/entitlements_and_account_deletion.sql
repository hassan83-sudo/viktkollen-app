-- Viktkollen entitlement and account deletion readiness.
-- Run in Supabase SQL Editor as a project admin. Never expose service-role
-- credentials in the client app.

create table if not exists public.user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'none',
  provider text not null default 'none',
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_entitlements_plan_check check (plan in ('free', 'premium', 'trial')),
  constraint user_entitlements_status_check check (status in ('none', 'active', 'trialing', 'canceled', 'past_due', 'expired', 'grace_period')),
  constraint user_entitlements_free_status_check check (
    plan <> 'free' or status in ('none', 'expired', 'canceled')
  )
);

create index if not exists user_entitlements_provider_customer_idx
on public.user_entitlements (provider, provider_customer_id)
where provider_customer_id is not null;

create index if not exists user_entitlements_provider_subscription_idx
on public.user_entitlements (provider, provider_subscription_id)
where provider_subscription_id is not null;

alter table public.user_entitlements enable row level security;
alter table public.user_entitlements force row level security;

drop policy if exists "Viktkollen users read own entitlement" on public.user_entitlements;
drop policy if exists "Viktkollen users insert own entitlement" on public.user_entitlements;
drop policy if exists "Viktkollen users update own entitlement" on public.user_entitlements;
drop policy if exists "Viktkollen users delete own entitlement" on public.user_entitlements;

create policy "Viktkollen users read own entitlement"
on public.user_entitlements for select to authenticated
using (auth.uid() = user_id);

-- No authenticated INSERT/UPDATE policy is created intentionally. Client-side
-- code must never be able to promote a user to premium. Server-side admin flows
-- or a future billing webhook own writes.

grant select on public.user_entitlements to authenticated;

comment on table public.user_entitlements is
  'Server-owned Viktkollen entitlement snapshot. Authenticated users may only read their own row through RLS; writes are reserved for server-side billing/admin flows.';
