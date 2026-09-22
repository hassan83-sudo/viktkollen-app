# BILL-4A — Admin authority, permissions & audit foundation

Branch: `billing-cost-metering-sprint1`
Base BILL-3C: `ba968c286205aecb56381eb87d8a41bc4de16fab`

**This migration is local-only.** Do not apply `supabase/migrations/20260921220000_billing_admin_authority.sql` to staging or production.

BILL-4A does **not** add feature kill switches, provider controls, cost limits, a cost dashboard, a full admin UI, or any payment provider.

## Auth source

Reuse existing server JWT verification: `verifySupabaseUser` → `auth.getUser(token)` with the anon key. The verified `user.id` is the only identity `requireBillingAdmin` uses.

Admin is **not** taken from:

- `localStorage` / React state
- query parameters or request-body booleans (`isAdmin`, `role`, `billing_admin`)
- client-editable user metadata
- hidden UI
- hardcoded frontend emails
- Social Watch/Board `ADMIN_USER_ID` (legacy UI only; not billing authority)

## Permission model

Stable capability: **`billing_admin`**.

Authoritative row: `billing.admin_permissions` (`user_id`, `permission`, `status` `ACTIVE` | `REVOKED`). Unique on `(user_id, permission)` so the same user cannot hold two authoritative rows for the same permission.

Revoke flips `ACTIVE` → `REVOKED`. The next `has_billing_admin` / `requireBillingAdmin` lookup is a live store/DB read. **No permission cache.**

Unknown, missing, or unverifiable identity → **deny**.

## Default deny

`requireBillingAdmin`:

1. Invalid/missing JWT → 401 (same safe auth errors as other billing APIs).
2. Valid JWT without `ACTIVE billing_admin` → 403 `{ error: { code: 'FORBIDDEN' } }` with no schema, other admins, or permission rows.
3. Only then `ok: true`.

In-process default store is empty until a trusted grant, so a freshly started API is deny-all.

## Spoof protection

Handler ignores `isAdmin`, `role`, `billing_admin`, and `admin_user_id` on the body. Actor for grant/revoke/audit is `admin.user.id` from JWT. A normal user cannot grant themselves `billing_admin`. Raw table DML is revoked from `anon` / `authenticated` (and from `service_role`; mutations are SECURITY DEFINER RPCs).

## Bootstrap strategy

**Not implemented as an HTTP or frontend path.** First admin must be inserted in a trusted database-owner session (postgres / BYPASSRLS), for example:

```sql
insert into billing.admin_permissions (user_id, permission, status)
values ('<verified-auth-user-uuid>', 'billing_admin', 'ACTIVE');
```

Do **not** run that bootstrap in BILL-4A. Tests use `bootstrapGrantForTests` on the in-memory store only.

## API guard

Reusable helper: `requireBillingAdmin` in `api/_shared/billing/admin.js`.

Foundation endpoint: `GET|POST /api/billing/admin`.

- `GET` → `{ ok, session: { authorized: true, permissions: ['billing_admin'] } }`
- `POST` `{ action: 'grant'|'revoke', target_user_id, reason_code }` after the same guard

Client-safe identity only. No internal JWT/metadata/secrets.

Future BILL-4 admin routes should call the same helper.

## RLS

Both `billing.admin_permissions` and `billing.admin_audit`:

| Role | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `anon` | deny (FORCE RLS + no GRANT) | deny | deny | deny |
| `authenticated` | deny | deny | deny | deny |
| `public` | restrictive `using (false)` | deny | deny | deny |
| `service_role` | GRANT SELECT only | revoked; INSERT via RPC | revoked | revoked |

Clients must not read permissions or audit over PostgREST. Later admin UI uses this server API.

## Grants

Schema usage: `service_role` only (same as BILL-1/2/3).

EXECUTE:

- `billing.has_billing_admin(uuid)` → `service_role`
- `billing.grant_billing_admin(actor, target, reason)` → `service_role`
- `billing.revoke_billing_admin(...)` → `service_role`
- `billing.append_admin_audit(...)` → **revoked from everyone** including `service_role`; called only from grant/revoke in the table owner context

PUBLIC execute is revoked. Functions use `SET search_path = pg_catalog, pg_temp` and schema-qualified objects. Actor UUID is supplied by trusted Node after JWT verify, not by client-controlled `auth.uid()` on PostgREST.

## Audit model

`billing.admin_audit`: `audit_id`, `admin_user_id`, `action`, `target_type`, `target_id`, `reason_code`, `before_safe`, `after_safe`, `created_at`.

Grant/revoke writes exactly one row on a real status change (idempotent already-ACTIVE grant does not insert a second permission row or a second audit).

## Append-only

Trigger `billing.admin_audit is append-only` blocks UPDATE and DELETE. Table UPDATE/DELETE privileges are revoked even from `service_role`. In-memory store throws `audit_append_only`.

## Privacy

Snapshots go through an allowlist: `permission`, `status`, `target_id`, `target_type`, `user_id`. Forbidden keys (`password`, `api_key`, `token`, `prompt`, `audio`, `coordinates`, card/CVV, `service_role`, `database_url`, …) raise `audit_sensitive_field`. No AI prompt/response, chat, GPS, images, or payment credentials.

## Concurrency

Unique `(user_id, permission)` plus `SELECT … FOR UPDATE` in grant/revoke. Concurrent first-insert hits `unique_violation` and returns the existing ACTIVE row (or reactivates REVOKED). No global advisory lock.

## Indexes / 50k foundation

- Permission lookup: `admin_permissions_user_active_idx` (`user_id` WHERE `ACTIVE`)
- Permission unique: `admin_permissions_user_permission_uidx`
- Audit: `created_at desc`, `(admin_user_id, created_at desc)`, `(action, created_at desc)`

No load test in BILL-4A. Lookups are indexed; no full-table scan is required for those access paths.

## BILL-1 / 2 / 3

This file does not ALTER usage, quota, or subscription tables and does not change quota or subscription semantics.

## Remaining risks

- Runtime API still uses the in-memory store until a later sprint wires `has_billing_admin` to Postgres after the migration is applied.
- First production admin requires a documented owner SQL insert (not done here).
- `service_role` can SELECT audit/permission rows; keep that key off the client (unchanged Vite anon-only client).
- Legacy Social `ADMIN_USER_ID` remains UI-only and is not `billing_admin`.

## Staging requirements

1. Security review of BILL-4A.
2. Apply `20260921220000_billing_admin_authority.sql` to staging only in a later isolated sprint.
3. Live tests: anon 401, normal user 403, spoof body 403, verified admin GET 200, self-grant 403, audit append-only, unique permission.
4. Optional trusted bootstrap of **one** staging admin via owner SQL — not BILL-4A.
5. Do not apply to production in this sprint.

## Next step

BILL-4A security review / staging preparation. Do not start BILL-4B. Do not apply this migration.
