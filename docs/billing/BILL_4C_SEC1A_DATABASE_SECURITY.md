# BILL-4C-SEC1a — Cost threshold database security

Status: **READY** (static review + same unapplied migration hardened)
Base: `9ad0d9447f218d9dac6495f50d347eaba30adaf6`

Migration `supabase/migrations/20260922000000_billing_cost_safety.sql` is **not applied** to staging or production. No bootstrap admin, no seed, no live enforcement.

## Schema

`billing.cost_thresholds`: `threshold_id`, `scope`, `feature_id`, `period`, `limit_mode`, `amount_minor`, `currency`, `enabled`, `version`, `updated_at`, `updated_by`.

No extra PII/content columns. No `created_at` (not required; `updated_at` is server `now()`).

## Money / allowlists

- `amount_minor bigint` ≥ 0, ≤ JS MAX_SAFE_INTEGER. No float.
- Currency `SEK` only (öre).
- Period `DAILY`/`MONTHLY`. Scope `GLOBAL`/`FEATURE`. Mode `SOFT_ALERT`/`HARD_STOP`.
- `enabled boolean not null default true` (RPC still requires an explicit boolean).
- `version integer not null` ≥ 1; insert must be 1.

## Scope consistency

CHECK: GLOBAL ⇒ `feature_id IS NULL`; FEATURE ⇒ `feature_id IS NOT NULL`.

## Canonical features

SQL FEATURE allowlist matches `canonicalFeatureIds()` (12 IDs). Unknown feature blocked.

## GLOBAL NULL uniqueness / feature uniqueness

`UNIQUE NULLS NOT DISTINCT (scope, feature_id, period, limit_mode)`.

PostgreSQL ordinary UNIQUE treats NULL as distinct; two `GLOBAL + NULL + DAILY + HARD_STOP` rows would otherwise be possible. NULLS NOT DISTINCT (and previously a `coalesce(feature_id,'')` unique index) makes one authoritative row per identity.

FEATURE: one current row per feature + period + limit_mode.

## Concurrent create / CAS / lost update

- Concurrent create: unique violation → `CONFIG_CONFLICT`. DB uniqueness is authority (no Node mutex).
- Update: `SELECT … FOR UPDATE` then `UPDATE … WHERE threshold_id AND version = expected`. Success: `version = version + 1`. Stale: `CONFIG_CONFLICT`, no change audit.
- Client cannot pass `new_version`.

Live two-updater proof is deferred to staging; SQL foundation is in place.

## Identity immutability

Trigger blocks changes to `threshold_id`, `scope`, `feature_id`, `period`, `limit_mode`, `currency`. Amount and `enabled` remain CAS-mutable. In-memory store also refuses identity rewrite.

## Admin / timestamps

Mutations call `billing.has_billing_admin` (BILL-4A ACTIVE permission). No `isAdmin`/`role` RPC args. `updated_by` = actor UUID. `updated_at` overwritten with `pg_catalog.now()`.

Migration does **not** insert `billing_admin`.

## RLS / grants / SECURITY DEFINER

FORCE RLS + restrictive deny-all to `public`. Anon/authenticated: no table DML.

`service_role`: **no** table SELECT/INSERT/UPDATE/DELETE. Execute only:

- `create_cost_threshold`
- `update_cost_threshold`
- `list_active_cost_thresholds`

Those functions: SECURITY DEFINER, `search_path = pg_catalog, pg_temp`, schema-qualified, no dynamic SQL. PUBLIC EXECUTE revoked.

## Audit

Actions: `cost.threshold.created` / `cost.threshold.changed`. Target: `cost_threshold` + authoritative `threshold_id`.

Snapshot allowlist: threshold_id, scope, feature_id, period, limit_mode, amount_minor, currency, enabled, version (plus existing 4A/4B admin keys). Sensitive keys rejected.

Create/update + audit are one PL/pgSQL transaction; audit failure rolls back the threshold. Stale CAS does not write a success audit.

CHECK constraints still include BILL-4A/4B actions and targets. Append-only trigger from 4A is not dropped. No audit history rewrite.

## Privacy / delete

No health, prompt, media, GPS, or credentials on the table. Disable via `enabled=false` CAS. DELETE raises.

## Indexes

PK (`threshold_id`) for CAS. Unique identity constraint. Partial active lookup indexes (global and feature). No `CONCURRENTLY`.

## Transaction / order

Single transactional migration (no concurrent index). Timestamp after BILL-4B (`20260921230000`). Depends on `billing.admin_audit` and `has_billing_admin`. Does not ALTER usage/quota/subscription/feature/provider tables.

## Findings

| ID | Severity | Status | Notes |
| --- | --- | --- | --- |
| F1 | MEDIUM | FIXED | `service_role` had table SELECT; replaced with `list_active_cost_thresholds` RPC. |
| F2 | MEDIUM | FIXED | Identity uniqueness documented as `coalesce` unique index; now `UNIQUE NULLS NOT DISTINCT` table constraint. |
| F3 | LOW | FIXED | In-memory CAS could rewrite identity; now `identity_immutable`. |
| F4 | LOW | ACCEPTED | `enabled` default `true`; RPC requires explicit boolean; raw insert blocked. |
| F5 | INFO | ACCEPTED | LOCAL_FREE canonical IDs are in the SQL allowlist; selection (4C2b1) does not apply them as cost drivers. |
| F6 | INFO | ACCEPTED | Audit names stay `cost.threshold.*` / `cost_threshold` (4A style), not `COST_THRESHOLD_CREATED`. |

CRITICAL: 0. HIGH: 0.

## Remaining work (BILL-4C-SEC1b)

Review aggregation + final cost-decision chain (summaries, classification, HARD/SOFT precedence). Do not start here. Do not apply this migration.
