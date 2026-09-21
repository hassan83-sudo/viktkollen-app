# BILL-4B2b — Provider control persistence, admin CAS & audit

Branch: `billing-cost-metering-sprint1`
Base BILL-4B2a: `ff381d7682fc38a55302333233c9668a67e50311`

## Migration strategy

**A — extend the same unapplied BILL-4B file.**  
`supabase/migrations/20260921230000_billing_feature_controls.sql` has not been applied to staging or production. BILL-4B1b already rewrites BILL-4A `admin_audit` action/target CHECKs in that file. Adding `provider_controls` and provider audit actions there avoids a second DROP/ADD of the same constraints and keeps one apply later.

Do **not** apply this SQL to staging or production. No `billing_admin` seed.

## Schema

`billing.provider_controls`: PK `provider_id`, `mode`, `reason_code`, `version` (≥ 1), `updated_at` (DB `now()`), `updated_by` (verified admin). Canonical IDs: `openai`, `google.cloud_run.ai_ear`. Modes: AVAILABLE / UNAVAILABLE / MAINTENANCE. Reasons: PROVIDER_OUTAGE / MAINTENANCE / SECURITY / MANUAL_ADMIN. DELETE blocked. No secrets columns.

Audit actions: `provider.control.created` / `provider.control.changed`. Target type `provider_control`. Snapshots: `provider_id`, `mode`, `reason_code`, `version`.

## Versioning / CAS

Create: version 1, `expected_version` 0/omitted. Update: expected must match; stored version is current + 1. Stale → `CONFIG_CONFLICT`, no row change, no success audit. SQL: unique INSERT / `UPDATE … WHERE provider_id = $1 AND version = expected`. Production authority is the database.

## Admin / audit

`setProviderControl` / `billing.set_provider_control` require BILL-4A `has_billing_admin`. Client `isAdmin` / `updated_by` / `updated_at` ignored. Mutation + audit in one transaction; audit failure rolls back.

## RLS / SECURITY DEFINER

FORCE RLS deny-all. anon/authenticated: no table DML. `service_role` SELECT only. `set_provider_control` SECURITY DEFINER, `search_path = pg_catalog, pg_temp`, EXECUTE `service_role` only. `append_admin_audit` remains ungranted to clients.

## Resolver

`resolveFromStore` loads persisted provider rows into unchanged `resolveOperationalAvailability`. Known provider, no row → AVAILABLE. Feature DISABLED/MAINTENANCE still win. Local features with no required provider stay AVAILABLE during OpenAI/Cloud Run outage. Not wired to live provider routes. UNAVAILABLE is emergency-stop foundation for **new** operations only; in-flight calls are not aborted. No cache.

## Indexes / 50k

PK/unique on `provider_id`. Single-row mutation. Audit uses BILL-4A indexes.

## Remaining risks

SQL unapplied. In-memory CAS is not the production boundary. No mutation request-id idempotency (retry with stale expected → CONFIG_CONFLICT). Combined BILL-4B security review next. Do not start BILL-4C.
