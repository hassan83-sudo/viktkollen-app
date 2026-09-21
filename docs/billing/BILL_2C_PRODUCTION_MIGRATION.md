# BILL-2C — Production plan/quota migration

Branch: `billing-cost-metering-sprint1`
Base BILL-2B: `a28fc1a709bcb6cf6bd303fa4f585c38d2e518e6`
Migration: `supabase/migrations/20260921180000_billing_plan_quota.sql`
Checksum: `38fba1959622f2129d4c11d42589efe8f4d65927` (matches BILL-2B staging)

Connection: gitignored `.env.production.local` only (Session pooler). Staging `.env.local` was not used as a URI. Production app, Vercel, and `main` were not changed.

## Prechecks

| Check | Result |
|---|---|
| TARGET | PRODUCTION |
| Production ref = database target | PASS |
| Production ≠ staging | PASS |
| SELECT 1 / TLS / auth | PASS |
| BILL-1 `billing.usage_events` | PASS |
| Pre-existing BILL-2 objects | NO |
| Collision (`public.plans`, etc.) | PASS |
| Recovery (WAL archive present, not in recovery) | VERIFIED |

## Apply

Exact file only, one transaction: **COMMITTED**. No other migrations. No BILL-1 replay. No test users, reservations, or assignments.

Catalog seed **from the approved SQL** (not extra fixtures): 15 `plans` rows (free + PRELIMINARY 4–99 SEK/month) and 180 `plan_entitlements`. These remain PRELIMINARY / ADMIN-CONFIGURABLE. No assignments, so no commercial plan is active for any user.

## Post-verify (read-only)

Tables: `plan_entitlements`, `plans`, `quota_period_locks`, `quota_reservations`, `usage_events`, `user_plan_assignments`.

Functions include `reserve_quota`, `commit_quota`, `rollback_quota`, `lock_quota_period`, `quota_reservation_guard`.

| Check | Result |
|---|---|
| RLS + FORCE RLS | PASS |
| anon/authenticated raw table access | BLOCKED (catalog) |
| service_role reservation INSERT/UPDATE, no DELETE | PASS |
| RPC EXECUTE: service_role only | PASS |
| SECURITY DEFINER + search_path pg_catalog, pg_temp | PASS |
| `quota_period_locks` + reserve RPC | PASS |
| State-machine / immutability guard | PASS |
| Quantity/unit/feature/status/period CHECKs | PASS |
| Indexes (user+feature+period, PENDING) | PASS |
| FKs | PASS |
| No prompt/audio/GPS/payment columns | PASS |
| BILL-1 usage table still present | UNCHANGED |

Row counts: plans 15, entitlements 180, assignments 0, period locks 0, reservations 0.

## Remaining risks

Quota RPCs are not wired into the production app. Branch is not merged to main. Do not start BILL-3 from this apply.

## Recommendation

BILL-2 production **schema foundation READY**. Next: Hassan review before BILL-3. No further production change from this sprint.
