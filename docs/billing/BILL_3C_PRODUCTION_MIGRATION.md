# BILL-3C — Production subscription migration

Branch: `billing-cost-metering-sprint1`
Base BILL-3B: `b6fe36c00ba1cdad42e4a7e3085a9d74d795f12b`
Migration: `supabase/migrations/20260921200000_billing_subscriptions.sql`
Checksum: `a8ff681db7820cc6a84dce92b79837dad71aab6b` (matches BILL-3B staging)

Connection: gitignored `.env.production.local` only (Session pooler). Staging `.env.local` was not used as a URI. Production app, Vercel, and `main` were not changed. No test subscriptions, events, trials, or quota writes.

## Prechecks

| Check | Result |
|---|---|
| TARGET | PRODUCTION |
| Production ref = database target | PASS |
| Production ≠ staging | PASS |
| SELECT 1 / TLS / auth | PASS |
| Checksum | PASS (`a8ff681db7820cc6a84dce92b79837dad71aab6b`) |
| BILL-1 `billing.usage_events` | PASS |
| BILL-2 plans/quota/reserve_quota | PASS |
| Pre-existing BILL-3 objects | NO |
| Collision | PASS |
| Recovery (WAL archive present, not in recovery) | VERIFIED |

## Apply

Exact file only, one transaction: **COMMITTED**. No other migrations. No BILL-1/BILL-2 replay. No production testdata.

## Post-verify (read-only)

Tables added: `subscriptions`, `subscription_events` (BILL-1/BILL-2 tables still present).

Functions include `create_subscription`, `transition_subscription`, `schedule_cancel_at_period_end`, `guard_subscription_row`, `subscription_transition_allowed`.

| Check | Result |
|---|---|
| RLS + FORCE RLS on BILL-3 tables | PASS |
| anon/authenticated raw table access | BLOCKED (catalog) |
| `service_role` SELECT only; no table INSERT/UPDATE/DELETE | PASS |
| RPC EXECUTE: service_role only | PASS |
| SECURITY DEFINER + search_path pg_catalog, pg_temp | PASS |
| Open unique `user_id` WHERE TRIALING/ACTIVE/PAST_DUE/PAUSED | PASS |
| State-machine guard | PASS |
| Terminal CANCELED/EXPIRED not in allowed-from map | PASS |
| Identity / plan snapshot / period-start immutable; period-end cannot extend | PASS |
| Period CHECK `end > start` | PASS |
| `schedule_cancel_at_period_end` present | PASS |
| `past_due_grace_until` cannot extend (guard) | PASS |
| `subscription_events` PK uniqueness | PASS |
| Indexes (open unique, user, user+status, events PK) | PASS |
| FKs RESTRICT/NO ACTION | PASS |
| No prompt/audio/GPS/payment columns | PASS |
| BILL-1 usage count unchanged (0) | UNCHANGED |
| BILL-2 plans 15, assignments 0, reservations 0 | UNCHANGED |
| `subscriptions` rows | **0** |
| `subscription_events` rows | **0** |

No live create/transition/race. No trials. No plan assignments. Quota engine HTTP still not wired.

## Remaining risks

RPCs are not used by the production app yet. Branch is not merged to main. Do not start BILL-4 from this apply.

## Recommendation

BILL-3 production **schema foundation READY**. Next: Hassan review before BILL-4. No further production change from this sprint.
