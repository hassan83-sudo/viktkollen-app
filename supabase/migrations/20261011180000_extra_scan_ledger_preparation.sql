-- Extra-scan ledger, PREPARATION ONLY. Do not apply to production until
-- reserve_quota/commit_quota/rollback_quota integration has been reviewed.
-- Purchases remain disabled. No client may create paid grants.
create table if not exists billing.extra_scan_grants (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  feature text not null check (feature in ('food.scan','body.scan','ai.eye.analysis')),
  unit text not null,
  payment_ref text not null unique,
  quantity integer not null check (quantity > 0 and quantity <= 100),
  status text not null check (status in ('VERIFIED_PAID','REVERSED')),
  created_at timestamptz not null default now()
);
create index if not exists extra_scan_grants_user_feature_idx
  on billing.extra_scan_grants(user_id, feature);

create table if not exists billing.extra_scan_allocations (
  reservation_id text primary key references billing.quota_reservations(reservation_id),
  grant_id bigint not null references billing.extra_scan_grants(id),
  quantity integer not null check (quantity > 0),
  status text not null check (status in ('PENDING','COMMITTED','ROLLED_BACK')),
  created_at timestamptz not null default now()
);
create index if not exists extra_scan_allocations_grant_idx
  on billing.extra_scan_allocations(grant_id);

alter table billing.extra_scan_grants enable row level security;
alter table billing.extra_scan_grants force row level security;
alter table billing.extra_scan_allocations enable row level security;
alter table billing.extra_scan_allocations force row level security;
revoke all on billing.extra_scan_grants from public, anon, authenticated;
revoke all on billing.extra_scan_allocations from public, anon, authenticated;
grant select on billing.extra_scan_grants to service_role;
grant select on billing.extra_scan_allocations to service_role;
-- No INSERT/UPDATE/DELETE grants even for service_role.
-- Future SECURITY DEFINER RPCs must atomically verify payments and allocate units
-- under a per-user/feature lock shared with billing.reserve_quota.
-- Refund/chargeback policy must be implemented before enabling checkout.
