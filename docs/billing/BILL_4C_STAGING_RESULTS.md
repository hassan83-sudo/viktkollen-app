# BILL-4C — Staging live cost-threshold verification

Branch: `billing-cost-metering-sprint1`
Base security verdict: `4fddc8a4c0de3bb460c7b95d93ba9bff64c8a029`
Migration: `supabase/migrations/20260922000000_billing_cost_safety.sql`
**Checksum (`git hash-object`): `67d4de0f061477bacb52646fca6195d6eec94ec7`**

Target: staging Session pooler from gitignored `.env.local` only.  
`.env.production.local` was not used. Production was not contacted.  
`BILLING_TEST_TARGET=staging`; staging project ref matched the pooler; staging ref ≠ production ref.

Apply: **COMMITTED** in one transaction. BILL-1/2/3/4A/4B present; `cost_thresholds` / `create_cost_threshold` absent beforehand (`COLLISION_CHECK: PASS`). No db reset. No other migration. No OpenAI / AI Ear calls. No quota consume. No subscription mutation. No live HARD_STOP wiring.

## Schema

Table `billing.cost_thresholds` with integer/bigint `amount_minor`, SEK, DAILY/MONTHLY, GLOBAL/FEATURE, SOFT_ALERT/HARD_STOP, uniqueness `NULLS NOT DISTINCT`, FORCE RLS, deny-all.

RPCs: `create_cost_threshold`, `update_cost_threshold`, `list_active_cost_thresholds` (SECURITY DEFINER, `pg_catalog, pg_temp`). PUBLIC/anon/authenticated EXECUTE revoked. `service_role` has **no** table SELECT/INSERT/UPDATE/DELETE; EXECUTE on those three RPCs only. `append_admin_audit` EXECUTE not granted to `service_role`.

Indexes: primary key (CAS), identity unique, active lookup (+ feature partial).

## Live results

| Check | Result |
| --- | --- |
| Money / currency / period / scope / mode | PASS (unknown blocked) |
| GLOBAL + feature_id / FEATURE + NULL | BLOCKED |
| Unknown feature | BLOCKED |
| GLOBAL NULL uniqueness (DAILY HARD_STOP) | PASS; one row; duplicate CONFIG_CONFLICT |
| FEATURE uniqueness (`food.scan` DAILY HARD_STOP) | PASS; one row |
| Staging admin create v1 + 1 audit | PASS |
| Update expected 1 → v2 + 1 audit | PASS |
| Stale expected 1 | CONFIG_CONFLICT; version 2; no extra change audit |
| Two real `pg.Client` updates expected 2 | **YES**; **SUCCESSFUL CONCURRENT UPDATES: 1**; other CONFIG_CONFLICT; final v3 |
| DB CAS authority | YES (not a JS mutex) |
| Concurrent first create GLOBAL MONTHLY HARD_STOP | PASS; one row |
| Identity immutability / DELETE | PASS / BLOCKED |
| enabled false + active read | PASS (disabled omitted from `list_active_cost_thresholds`) |
| updated_by / updated_at | SERVER / DB (`now()`, not 2099) |
| anon/authenticated raw CRUD + PostgREST RPC | BLOCKED |
| Normal user create | BLOCKED |
| Body isAdmin spoof | BLOCKED |
| Audit UPDATE/DELETE | BLOCKED |
| Dummy api_key/secret/token/password/prompt | not persisted |
| JS costDriving / spoof / HARD UNAVAILABLE / SOFT UNAVAILABLE | SERVER / BLOCKED / DENY / SIGNAL + ALLOW |

## Limitations (unchanged)

HISTORICAL TIMESTAMP: PARTIAL  
HISTORICAL COST: PARTIAL  
50K FOUNDATION: PARTIAL  

Staging did not pretend to solve these.

## Leftovers (staging only)

Synthetic Auth users `bill4c-*@invalid.example`. One ACTIVE staging `billing_admin`. Synthetic `cost_thresholds` rows for GLOBAL DAILY/MONTHLY HARD_STOP, GLOBAL DAILY SOFT_ALERT (timestamp probe), FEATURE `food.scan` DAILY HARD_STOP (disabled). Append-only audit leftovers **left in place**. No production admin.

## Vercel

11 deployable functions. Hobby limit 12. No new API route.

## Recommendation

**APPROVE FOR SEPARATE PRODUCTION STEP** after Hassan review of checksum `67d4de0f061477bacb52646fca6195d6eec94ec7`.

Do not apply to production from this sprint. Do not start the next billing sprint. Do not wire live HARD_STOP.
