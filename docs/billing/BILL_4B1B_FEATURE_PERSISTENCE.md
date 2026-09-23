# BILL-4B1b — Feature control persistence, admin mutation & audit

Branch: `billing-cost-metering-sprint1`
Base BILL-4B1a: `9baa590cb6ae8dd4487bca715c885b7a77b58d88`

**Local migration only:** `supabase/migrations/20260921230000_billing_feature_controls.sql`. Do not apply to staging or production. No billing_admin bootstrap. No live app hook.

## Schema

`billing.feature_controls`: PK `feature_id`, `mode`, `reason_code`, `version` (≥ 1), `updated_at` (DB `now()`), `updated_by` (verified admin UUID).

Canonical IDs are CHECK-listed from `features.js`. Modes: ENABLED / DISABLED / MAINTENANCE. Reasons: MAINTENANCE / MANUAL_ADMIN / SECURITY (required unless ENABLED). DELETE blocked by trigger. No reset RPC; set ENABLED via audited mutation.

BILL-4A `admin_audit` allowlists are extended in this file: actions `feature.control.created` / `feature.control.changed`, target_type `feature_control`, target_id token (feature id). Snapshots allow `feature_id`, `mode`, `reason_code`, `version` only among control fields.

## Versioning

Create: `version = 1`, `expected_version` 0 or omitted. Update: `expected_version` must equal current; stored version is **current + 1**. Client `new_version` ignored. Stale expected → `CONFIG_CONFLICT`, no row change, no success audit.

Atomic SQL: `INSERT` unique / `UPDATE … WHERE feature_id = $1 AND version = expected`. Unique violation on concurrent first create → `CONFIG_CONFLICT`. In-memory tests use the same CAS contract; **production authority is the database**, not a Node mutex.

## Idempotency limitation

No mutation request-id. A retry with the **same** expected version after success is `CONFIG_CONFLICT` (no double increment). A retry with the **new** expected version and the same mode still increments. Documented; full idempotency is later.

## Admin authority

`setFeatureControl` / `billing.set_feature_control` require BILL-4A `has_billing_admin`. Body `isAdmin` / `role` ignored. `updated_by` is the JWT/admin actor. No cache.

## Audit

Successful create/update: exactly one audit row in the **same transaction** (SQL function). Audit insert failure rolls back the control write (SQL transaction; in-memory store rollback). CONFIG_CONFLICT writes no change audit.

## RLS / grants / SECURITY DEFINER

FORCE RLS deny-all. anon/authenticated: no table DML. `service_role` SELECT only. Mutations: `set_feature_control` SECURITY DEFINER, `search_path = pg_catalog, pg_temp`, EXECUTE `service_role` only. `append_admin_audit` remains ungranted to clients/`service_role`.

## Resolver

`resolveFromStore` loads a row (or null) and calls unchanged `resolveFeatureAvailability`. Known feature + no row → AVAILABLE. DB DISABLED/MAINTENANCE maps to those results. Not wired to production provider calls.

## Indexes / 50k

PK/unique on `feature_id`. Single-row mutation. Audit uses BILL-4A indexes.

## Remaining risks / BILL-4B2

- SQL not applied; app still in-memory empty (all known features default AVAILABLE).
- Canonical ID CHECK must be migrated when a new feature is added.
- BILL-4B2: providers. BILL-4C: cost. Do not apply this SQL until Hassan review.
