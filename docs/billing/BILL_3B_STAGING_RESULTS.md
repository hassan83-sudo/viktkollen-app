# BILL-3B — Staging apply and live subscription concurrency

Branch: `billing-cost-metering-sprint1`
Migration: `supabase/migrations/20260921200000_billing_subscriptions.sql`
**Checksum (`git hash-object`): `a8ff681db7820cc6a84dce92b79837dad71aab6b`**

Target: staging Session pooler from gitignored `.env.local` only.
`.env.production.local` was not used. Production was not contacted.
`BILLING_TEST_TARGET=staging`; staging project ref matched the pooler user; staging ref ≠ production ref.

First apply: **COMMITTED** in one transaction (BILL-1 `usage_events` and BILL-2 plans/quota present; BILL-3 objects absent beforehand). A follow-up verification pass skipped re-apply (`SKIPPED_ALREADY_PRESENT`) after a runner snapshot bug in the effective-plan matrix; the schema was not applied twice.

## Schema created

Tables: `subscriptions`, `subscription_events` (plus existing BILL-1/BILL-2 tables).

Functions: `create_subscription`, `transition_subscription`, `schedule_cancel_at_period_end`, `guard_subscription_row`, `subscription_transition_allowed`.

Triggers/indexes include `subscriptions_one_open_per_user_uidx` (partial unique on `user_id` where status ∈ TRIALING/ACTIVE/PAST_DUE/PAUSED) and `subscription_events` PK on `external_event_id`. FK `ON DELETE RESTRICT`.

## Security live

| Check | Result |
|---|---|
| RLS + FORCE RLS on both BILL-3 tables | PASS |
| anon/authenticated raw SELECT/INSERT/UPDATE/DELETE | BLOCKED |
| `service_role` SELECT only; no table INSERT/UPDATE/DELETE | PASS |
| EXECUTE create/transition/schedule: `service_role` only; not PUBLIC/anon/authenticated | PASS |
| `create_subscription` SECURITY DEFINER + `search_path` pg_catalog, pg_temp | PASS |

Synthetic UUID users and `bill3b-*` event ids only. Preliminary plan `plan.prelim.sek.month.19`. Leftover rows and `plan.bill3b.inactive` left in place (no trigger weakening).

## Two real PostgreSQL sessions

Two `pg.Client` connections (not one JS mutex, not in-memory Maps). Concurrent `billing.create_subscription` for the **same** user, **different** `external_event_id`, status ACTIVE.

| Check | Result |
|---|---|
| Successful open subscriptions | **1** |
| Other session | `duplicate_open_subscription` |
| Authority | partial unique index `subscriptions_one_open_per_user_uidx` |
| Same `external_event_id` two sessions | one row, one event, both identify the same subscription |
| Two different users concurrent | both created (no global lock) |
| TRIALING / ACTIVE / PAST_DUE / PAUSED each blocks a second open create | PASS |
| CANCELED history then new ACTIVE | PASS (history retained) |

## State / period / resolver

Allowed BILL-3A transitions: PASS. Terminal reactivation and PAST_DUE→PAUSED / PAUSED→EXPIRED: BLOCKED.
Identity/plan snapshot/period start immutable. Period end cannot be extended. `end <= start` rejected by RPC.
`created_at` matches DB `now()` (not a client clock).
Cancel-at-period-end: entitled during period, baseline after `period_end`.
PAST_DUE without grace → `plan.free`; with trusted grace → paid plan. Grace extension BLOCKED.
TRIALING in period entitled. Unknown/inactive plan create BLOCKED.
Effective-plan matrix (no sub / ACTIVE / TRIALING / PAST_DUE±grace / PAUSED / CANCELED / EXPIRED / ended / unknown plan): PASS.
Quota inspect via server resolver: paid limit for entitled user; free limit with no sub; client `plan_id` ignored. No provider spend.

Privacy: no prompt/audio/GPS/card columns. 50k foundation: PASS from per-user unique index + no global lock (no load test).

## Remaining risks

- Staging still has synthetic BILL-3B rows and `plan.bill3b.inactive`.
- Production app user flows are not wired to these RPCs.
- Production must not use this file until Hassan review (same isolated process as BILL-1E/2C).

## Recommendation

**APPROVE FOR SEPARATE PRODUCTION STEP** after Hassan review.
Do not apply to production from this sprint. BILL-4 not started.
