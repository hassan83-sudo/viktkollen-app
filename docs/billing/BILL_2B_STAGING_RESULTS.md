# BILL-2B — Staging apply and live Postgres quota race

Branch: `billing-cost-metering-sprint1`
Migration: `supabase/migrations/20260921180000_billing_plan_quota.sql`
**Checksum (`git hash-object`): `38fba1959622f2129d4c11d42589efe8f4d65927`**

Target: staging Session pooler from gitignored `.env.local` only.
`.env.production.local` was not used. Production was not contacted.

Transaction: **COMMITTED**. Collision check: BILL-1 `usage_events` present; BILL-2 objects absent beforehand.

## Schema created

Tables: `plans`, `plan_entitlements`, `user_plan_assignments`, `quota_period_locks`, `quota_reservations` (plus existing BILL-1 `usage_events`).

Functions: `reserve_quota`, `commit_quota`, `rollback_quota`, `lock_quota_period`, `period_bounds`, `quota_period_used`, `quota_reservation_guard` (plus BILL-1 `reject_usage_event_mutation`).

## Security live

| Check | Result |
|---|---|
| RLS + FORCE RLS on BILL-2 tables | PASS |
| anon/authenticated raw SELECT/INSERT | BLOCKED |
| service_role INSERT/UPDATE reservations, no DELETE | PASS |
| EXECUTE reserve/commit/rollback: service_role only; not PUBLIC/anon/authenticated | PASS |
| `reserve_quota` SECURITY DEFINER + `search_path` pg_catalog, pg_temp | PASS |

Race feature fixture used **`food.scan`** (closed CHECK list). `test.quota.race` is not a valid feature id. Plans: `plan.bill2b.race` (limit 1), `plan.bill2b.wide`, `plan.bill2b.unlim`, `plan.bill2b.disabled`. Synthetic users only. Rows left in place (no trigger weakening).

## Two real PostgreSQL sessions

Two `pg.Client` connections (not one JS mutex, not one in-memory engine). Concurrent `billing.reserve_quota` for the same user/feature/period with limit 1.

| Check | Result |
|---|---|
| Successful reservations | **1** |
| Other session | `DENIED_QUOTA_EXCEEDED` |
| Lock | `SELECT FOR UPDATE` on `quota_period_locks` |
| Global lock | **NO** (two different users both reserved) |

## State / commit / rollback

PENDING→COMMITTED, PENDING→ROLLED_BACK, PENDING→EXPIRED: PASS.
Terminal reactivation and identity updates: BLOCKED.
Commit 10, actual 6, double commit, rollback, double rollback, commit-after-rollback, rollback-after-commit: PASS/BLOCKED as designed.
Zero quantity ALLOWED with no row. Negative / unit mismatch / disabled / unknown feature: BLOCKED. Unlimited: `UNLIMITED` without numeric fake limit.
Unknown plan: `DENIED_UNKNOWN_PLAN` when `plan.free` is inactive (default unassigned user otherwise maps to `plan.free`). `plan.free` restored active.
Idempotent same `reservation_id`: one row. Period `end > start`. Privacy: no prompt/audio/GPS/payment columns. Indexes include user+feature+period and PENDING partial. 50k foundation: PASS from lock scope + indexes (no load test).

## Remaining risks

- Staging still has synthetic BILL-2B rows/plans.
- Engine HTTP is not wired to these RPCs yet.
- Production must not use this file until Hassan review (same isolated process as BILL-1E).

## Recommendation

**APPROVE FOR SEPARATE PRODUCTION STEP** after Hassan review.
Do not apply to production from this sprint. BILL-3 not started.
