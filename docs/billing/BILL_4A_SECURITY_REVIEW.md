# BILL-4A security review — admin authority migration

Branch: `billing-cost-metering-sprint1`
Base BILL-4A: `1e6929b8af5e8aaa8beda4475e4ee7a498eeb225`
Migration reviewed: `supabase/migrations/20260921220000_billing_admin_authority.sql` (local only; **not applied**)

This sprint is static review plus in-place hardening of the unapplied file. No staging/production SQL. No first `billing_admin` bootstrap. BILL-4B not started.

## Authority source

`requireBillingAdmin` → `verifySupabaseUser` → Supabase `auth.getUser(bearerToken)` (GoTrue cryptographic session verification with project URL + anon key). Only `user.id` is kept.

Not used: JWT payload decode without verify, `user_metadata`, `app_metadata`, `localStorage`, React state, query, body (`isAdmin`, `role`, `billing_admin`, `admin_user_id`), Social `ADMIN_USER_ID`.

## JWT / auth verification

**PASS.** Server calls `client.auth.getUser(token)`, not `jwt.decode`. Invalid/missing token → 401. Lookup errors in permission check → 403 (fail closed).

## Table inventory

### `billing.admin_permissions`

| | |
| --- | --- |
| Purpose | Authoritative capability rows (`billing_admin` only) |
| PK | `permission_id` (text, uuid default) |
| FK | none |
| Unique | `admin_permissions_user_permission_uidx` on `(user_id, permission)` |
| CHECK | `permission = 'billing_admin'`; `status in ('ACTIVE','REVOKED')`; id length |
| RLS | enabled; policy `admin_permissions_deny_all` restrictive `using (false) with check (false)` to `public` |
| FORCE RLS | yes |
| Grants | `REVOKE ALL` from public/anon/authenticated/service_role; `GRANT SELECT` to `service_role` only |
| Indexes | unique `(user_id, permission)`; partial `(user_id) WHERE status = 'ACTIVE'` |
| Triggers | `admin_permissions_guard` BEFORE INSERT/UPDATE/DELETE → `guard_admin_permission_row` |

### `billing.admin_audit`

| | |
| --- | --- |
| Purpose | Append-only admin action log |
| PK | `audit_id` |
| FK | none |
| Unique | PK only |
| CHECK | action in `permission.grant` / `permission.revoke`; `target_type = 'admin_permission'`; `target_id` UUID text; reason allowlist; `before_safe`/`after_safe` JSON objects; octet_length ≤ 2048 |
| RLS | enabled; deny-all restrictive to `public` |
| FORCE RLS | yes |
| Grants | `REVOKE ALL` then `GRANT SELECT` to `service_role` |
| Indexes | `(created_at desc)`; `(admin_user_id, created_at desc)`; `(action, created_at desc)` |
| Triggers | `admin_audit_guard` BEFORE INSERT/UPDATE/DELETE → append-only (UPDATE/DELETE raise) |

No other BILL-4A tables. No `feature_controls`. BILL-1/2/3 tables are not ALTER'd.

## Permission table / allowlist / status / active-only

CHECK + JS store reject unknown permission names and unknown statuses. `has_billing_admin` / `hasBillingAdmin` require `permission = billing_admin` **and** `status = ACTIVE`. `REVOKED` denies. Identity immutable (`user_id`, `permission`, `permission_id`, `created_at`). DELETE of permission rows is blocked by trigger.

## Self-grant / cross-user grant

HTTP grant/revoke runs only after `requireBillingAdmin`. A normal user cannot reach `grant_billing_admin`. RPC EXECUTE is `service_role` only; actor must already be ACTIVE `billing_admin`. No public bootstrap RPC.

## Uniqueness / concurrent grant

DB unique `(user_id, permission)` is the authority. `grant_billing_admin` uses `SELECT … FOR UPDATE` and catches `unique_violation`. Concurrent grant+revoke: **last committed UPDATE wins** under the row lock (documented; staging should still race-test).

## Revoke / re-grant

Revoke sets `REVOKED` and writes one audit row. Next `requireBillingAdmin` is a live lookup (**no permission cache**). Re-grant `REVOKED → ACTIVE` is allowed only via trusted `grant_billing_admin` / `service.grant`, and writes a new grant audit.

## Bootstrap

No HTTP bootstrap. No RPC that grants without an existing admin. First admin is a later **database owner** insert (postgres / BYPASSRLS). **Not executed** in this sprint. Tests only: `bootstrapGrantForTests` on in-memory store.

## Default deny / fail closed

Missing JWT → 401. No ACTIVE row, unknown id, store/DB throw → 403/`has_billing_admin` returns false (`WHEN OTHERS THEN return false` in SQL).

## RLS / raw client access

anon + authenticated: no schema usage, no table DML/SELECT, FORCE RLS deny-all. They cannot list admins or audit. `service_role`: SELECT only; mutations via SECURITY DEFINER.

## SECURITY DEFINER

| Function | search_path | EXECUTE |
| --- | --- | --- |
| `has_billing_admin` | `pg_catalog, pg_temp` | `service_role` |
| `grant_billing_admin` | same | `service_role`; requires actor ACTIVE admin |
| `revoke_billing_admin` | same | `service_role`; same |
| `append_admin_audit` | same | **revoked from all including service_role**; called only by grant/revoke |
| `admin_audit_snapshot` | same | revoked from all |
| Guards | same | revoked |

All objects schema-qualified. PUBLIC/anon/authenticated EXECUTE revoked.

## Audit

Created only inside grant/revoke (same plpgsql transaction on DB). `admin_user_id` is `p_actor_user_id` from verified JWT on the API, never body `admin_user_id`. Actions/target_type allowlisted. Snapshots: flat object, string scalars, allowlist keys only, nested object/array rejected, sensitive keys (incl. case/prefix such as `PASSWORD`, `user_password`, `auth_token`) rejected, size ≤ 2048 bytes. UPDATE/DELETE blocked by trigger + no grants.

In-memory JS: if audit insert fails after a permission upsert, the service rolls the permission row back.

Idempotent already-ACTIVE grant: no second permission row, no extra audit.

## Indexes / 50k

Permission lookup is unique + partial ACTIVE index on `user_id`. Audit filters `created_at`, `admin_user_id`, `action` are indexed. Pagination is not implemented yet (no admin list API). No load test.

## Social admin isolation

`SocialWatch.jsx` / `SocialBoard.jsx` still use hardcoded `ADMIN_USER_ID` for UI only. Billing admin modules do not import it. No bridge.

## Changes in this review

- Audit action/target_type/target_id CHECKs; snapshot size/object CHECKs
- Snapshot sanitizer: nested reject, case/prefix sensitive keys, 2048-byte cap, string-only allowlist
- Grant/revoke pass allowlisted JSON (not full `to_jsonb(row)`)
- `has_billing_admin` fail-closed on errors
- Unique-violation path takes `FOR UPDATE`
- JS store status/permission allowlist; grant/revoke rollback; `requireBillingAdmin` catch → deny
- Expanded static/unit tests

## Remaining risks

- Runtime API still uses in-memory permissions until a later sprint wires Postgres RPCs after apply
- Compromised `service_role` can SELECT admin/audit and EXECUTE grant/revoke (expected for server; key must stay off the client)
- First admin still requires a trusted owner insert (not done)
- Concurrent grant+revoke last-writer-wins is specified but not live-tested
- Legacy Social `ADMIN_USER_ID` remains a separate UI concern

## Staging recommendation

**DO NOT APPROVE YET.** Hassan review of this document and the hardened SQL first. Then a later isolated sprint may apply the same file to staging only. Do not bootstrap a staging admin in this sprint. Do not apply to production.

## Next step

HASSAN REVIEW BEFORE BILL-4A STAGING.
