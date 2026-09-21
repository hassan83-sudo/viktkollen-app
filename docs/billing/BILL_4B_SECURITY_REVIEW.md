# BILL-4B — Combined feature + provider controls security review

Branch: `billing-cost-metering-sprint1`
Base BILL-4B2b: `3f724ec1fe7a6a4aad7cbd826d4bcc8de76ddb14`

**Unapplied.** Do not apply to staging or production. No `billing_admin` seed.

## Object inventory

New tables: `billing.feature_controls`, `billing.provider_controls`.

Functions / RPC: `guard_feature_control_row`, `set_feature_control`, `guard_provider_control_row`, `set_provider_control`. Replaces BILL-4A `admin_audit_snapshot` and `append_admin_audit`.

Triggers: `feature_controls_guard`, `provider_controls_guard` (BEFORE INSERT/UPDATE/DELETE).

Constraints: PK + CHECK allowlists on both control tables; BILL-4A `admin_audit` action/target/target_id CHECKs dropped and re-added (4A actions retained; feature/provider added). No FK on `updated_by` (no cascade wipe of config/audit).

Indexes: PK plus unique `feature_id` / `provider_id`. BILL-4A audit indexes unchanged.

Grants: schema USAGE `service_role` only. Tables: REVOKE ALL, GRANT SELECT `service_role`. EXECUTE: setters `service_role` only; `append_admin_audit` / guards / snapshot revoked from public/anon/authenticated/`service_role`.

Policies: FORCE RLS deny-all (`feature_controls_deny_all`, `provider_controls_deny_all`).

## Feature / provider tables

Authoritative `feature_id` / `provider_id`. Modes: feature ENABLED/DISABLED/MAINTENANCE; provider AVAILABLE/UNAVAILABLE/MAINTENANCE. Reasons match JS (feature: MAINTENANCE/MANUAL_ADMIN/SECURITY; provider + PROVIDER_OUTAGE). `version >= 1`. `updated_at` DB `now()`. `updated_by` RPC actor UUID. RPC also validates mode/reason before write.

JS registries (`features.js`, `providers.js`) match SQL CHECK lists. Unknown IDs blocked; no row created.

## CAS / concurrency

`SELECT … FOR UPDATE`; create `expected_version = 0` + unique insert (`unique_violation` → `CONFIG_CONFLICT`); update `WHERE … AND version = expected` then trigger `old.version + 1`. Client cannot set stored version/`updated_at`/`updated_by`. In-memory CAS is not the production boundary.

Lost-update: two updates from version 1 — one succeeds, one `CONFIG_CONFLICT`. Live two-session proof is a staging item.

## Admin / spoof

Mutations require BILL-4A `has_billing_admin`. No new admin model. No permission INSERT in this file. Production remains 0 admins. Client `isAdmin` / `role` / `billing_admin` / `updated_by` ignored.

## RPC / service_role

SECURITY DEFINER, `search_path = pg_catalog, pg_temp`, schema-qualified `billing.*`. PUBLIC/anon/authenticated EXECUTE revoked. `service_role`: SELECT on control tables + EXECUTE setters. **No table INSERT/UPDATE/DELETE.** Stolen `service_role` can still EXECUTE setters if it also supplies an ACTIVE admin UUID (same 4A boundary).

## Audit extension

Actions: `permission.grant|revoke`, `feature.control.created|changed`, `provider.control.created|changed`. Targets: `admin_permission`, `feature_control`, `provider_control`. Action/target pairing enforced. Snapshots: allowlisted `feature_id`/`provider_id`/`mode`/`reason_code`/`version` plus 4A permission fields. Nested objects/arrays, 2048-byte cap, and sensitive-key deny list retained and extended (`secret`, `credential`, `gps`). No DELETE of audit history. Existing 4A UUID `target_id` still matches token regex. Staging/prod 4A rows (if any) remain valid; production audit count is 0.

Mutation + `append_admin_audit` in one function/transaction. Audit failure rolls back. CONFIG_CONFLICT raises before write/audit.

DELETE of control rows blocked by trigger. No client/admin DELETE path.

## Resolver / mapping / emergency

Decision order unchanged: unknown feature → DISABLED → MAINTENANCE → unknown provider → UNAVAILABLE → MAINTENANCE → AVAILABLE. Feature DISABLED/MAINTENANCE win. Locals (`friend_chat`, `tts.request`, …) have no required providers. No quota/subscription/cost. **Not wired** to `api/*`. Provider UNAVAILABLE is emergency stop for **new** operations only; in-flight calls are not aborted. No cache.

## Migration order / transactions

Requires BILL-1/2/3/4A already applied. All statements are transactional DDL (no `CONCURRENTLY`). First apply only; `CREATE TABLE IF NOT EXISTS` is safe because tables do not exist yet.

## Idempotency limitation (not blocking)

Retry with **old** `expected_version` → `CONFIG_CONFLICT`, no double increment. Retry with **new** expected version is a new mutation. No request-id idempotency yet.

## Remaining risks / staging

SQL unapplied; runtime still in-memory (all known IDs default AVAILABLE). Live RLS/CAS races not executed. Closed CHECK lists need ALTER for new IDs. Future HTTP routes must use `requireBillingAdmin` and trusted `actorUserId`.

**Staging recommendation: DO NOT APPROVE YET.** Hassan review before BILL-4B staging. Do not start BILL-4C. Do not bootstrap production `billing_admin` in the apply step.
