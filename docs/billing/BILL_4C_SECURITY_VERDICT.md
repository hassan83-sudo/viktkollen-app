# BILL-4C combined security verdict

Status: **READY** for a separate BILL-4C staging sprint
Base: `a5f488666d38fd217cd07b66bcb4f20984c38815`

This is a verdict only. The cost-threshold migration is **not applied**. Live hard-stop is **not** wired.

## SEC1a verdict — READY

`8ec9ae3e81f0e2ed7d370ad66a596892ecb1203b`

Unapplied `20260922000000_billing_cost_safety.sql`:

- Integer `amount_minor` (öre), SEK only, DAILY/MONTHLY, GLOBAL/FEATURE, SOFT_ALERT/HARD_STOP
- GLOBAL `feature_id IS NULL` / FEATURE `feature_id IS NOT NULL`
- Canonical 12-feature allowlist matches `canonicalFeatureIds()`
- `UNIQUE NULLS NOT DISTINCT (scope, feature_id, period, limit_mode)`
- DB CAS: `UPDATE … WHERE threshold_id AND version = expected`; version +1
- Identity immutable (scope, feature_id, period, limit_mode, currency)
- ACTIVE `billing.has_billing_admin`; no bootstrap admin
- FORCE RLS + deny-all; anon/authenticated CRUD revoked
- SECURITY DEFINER RPCs, `search_path = pg_catalog, pg_temp`, no table DML for `service_role`
- Create/update + audit in one transaction; stale CAS writes no success audit
- BILL-4A append-only audit trigger not dropped; 4A/4B actions still in CHECK
- Disable via `enabled=false`; no DELETE RPC

## SEC1b verdict — READY

`a5f488666d38fd217cd07b66bcb4f20984c38815`

- `isCostDrivingFeature()` from server registry only. Caller `costDriving` is voided.
- EXTERNAL_COST + `costDriving=false` still selects and evaluates thresholds.
- `resolveCostSafety` reads `mode || limit_mode` so 4C2b1 rows stay SOFT/HARD.
- Aggregation classifications are server-side; client MEASURED/0/underLimit ignored.
- HARD + UNAVAILABLE deny; SOFT-only UNAVAILABLE signal + allow; never 0.
- Precedence: INVALID > HARD_STOP > HARD_UNAVAILABLE > SOFT_ALERT > SOFT_UNAVAILABLE > SAFE.
- Max 8 relevant thresholds, max 4 unique summaries.
- No evaluation side effects. Not imported by live API routes.

## DB ↔ JS contract

SQL CHECKs match catalog enums (`GLOBAL`/`FEATURE`, `DAILY`/`MONTHLY`, `SOFT_ALERT`/`HARD_STOP`, `SEK`). Feature allowlist is the same 12 IDs as `features.js`. JS uniqueness key is `scope|feature|period|limit_mode`; SQL uses NULLS NOT DISTINCT on the same tuple. JS CAS expectedVersion maps to SQL `p_expected_version`. SEC1b did not drift these contracts.

## Admin / audit

Still BILL-4A ACTIVE `billing_admin`. Client `isAdmin` / `role` is not RPC authority. Snapshots are allowlisted (threshold identity + money + enabled + version). Sensitive keys rejected. Append-only intact.

## Remaining documented limitations (do not hide)

| Topic | Verdict | Staging impact |
| --- | --- | --- |
| Historical timestamp | PARTIAL — stored `occurred_at`; BILL-1 insert fixtures may set it | Document in staging plan; do not treat client-backdated inserts as in-scope 4C pass |
| Historical cost | PARTIAL — catalog reprice at `occurred_at`, no per-event money snapshot | Same; do not claim MEASURED money history |
| 50K foundation | PARTIAL — bounded rows still priced in Node | Staging security tests stay small; not a bypass |

These are foundation limits, not open decision-chain bypasses. They do **not** block approving a **separate** staging-migration/live-verification sprint.

## Remaining risks (accepted for this verdict)

- Evaluation is not yet on live cost-driving routes (intentional). Staging live-enforcement is a later sprint.
- Platform-wide cost aggregation (not per-user). Per-user spend caps remain BILL-2 quota.
- `service_role` can execute threshold RPCs after JWT+admin checks in Node; table DML remains revoked.

## Vercel

11 deployable `api/**/index.js` entrypoints. Hobby limit 12. No new route in 4C.

## Staging recommendation

**APPROVE FOR BILL-4C STAGING** as a **separate** sprint after Hassan review.

Do not apply SQL in this verdict. Do not merge to main. Do not enable live HARD_STOP yet.

Staging sprint should: apply the unapplied cost-threshold migration to staging only, prove concurrent create + CAS, keep 4A/4B audit history, and only then consider a later live-enforcement sprint.
