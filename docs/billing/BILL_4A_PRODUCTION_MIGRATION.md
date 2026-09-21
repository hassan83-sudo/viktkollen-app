# BILL-4A — Production admin authority schema foundation

Branch: `billing-cost-metering-sprint1`
Base staging: `1fbbdf0ee83d00d59367e32e6f2e62314e84e0a4`
Migration: `supabase/migrations/20260921220000_billing_admin_authority.sql`
Checksum: `d8cc1f98e68d8cbbf8b8e26775e2052d6719bf68` (matches BILL-4A staging)

Connection: gitignored `.env.production.local` only (Session pooler). Staging `.env.local` was not used as a URI. Production app, Vercel, and `main` were not changed.

**No production billing_admin.** No permission rows, no audit rows, no grants, no revoke, no Auth users, no bootstrap.

## Prechecks

| Check | Result |
| --- | --- |
| TARGET | PRODUCTION |
| Production ref = database target | PASS |
| Production ≠ staging | PASS |
| SELECT 1 / TLS / auth | PASS |
| Checksum | PASS (`d8cc1f98e68d8cbbf8b8e26775e2052d6719bf68`) |
| BILL-1 `billing.usage_events` | PASS |
| BILL-2 plans/quota | PASS |
| BILL-3 subscriptions | PASS |
| Pre-existing BILL-4A objects | NO |
| Collision | PASS |
| Recovery (WAL archive present, not in recovery) | VERIFIED |

## Apply

Exact file only, one transaction: **COMMITTED**. No other migrations. No BILL-1/2/3 replay.

## Post-verify (read-only)

Tables added: `admin_permissions`, `admin_audit` (BILL-1/2/3 tables still present).

Functions: `has_billing_admin`, `grant_billing_admin`, `revoke_billing_admin`, `append_admin_audit`, `admin_audit_snapshot`, guards.

| Check | Result |
| --- | --- |
| RLS + FORCE RLS | PASS |
| anon/authenticated raw table access | BLOCKED (catalog) |
| `service_role` SELECT only; no table INSERT/UPDATE | PASS |
| RPC EXECUTE: has/grant/revoke `service_role` only; append not granted | PASS |
| SECURITY DEFINER + `search_path` pg_catalog, pg_temp | PASS |
| Permission CHECK `billing_admin` + `ACTIVE`/`REVOKED` + unique `(user_id, permission)` | PASS |
| `has_billing_admin` ACTIVE-only + fail-closed | PASS |
| Default deny with 0 rows | PASS |
| Audit action/target/reason CHECKs | PASS |
| Audit append-only trigger | PASS |
| Snapshot nested/sensitive/size guards | PASS |
| Indexes (unique, ACTIVE, audit created/admin/action) | PASS |
| No prompt/audio/GPS/payment/secret columns | PASS |
| Social `ADMIN_USER_ID` permission rows | 0 (no bridge) |
| `admin_permissions` rows | **0** |
| `admin_audit` rows | **0** |
| BILL-1 usage count | UNCHANGED (0) |
| BILL-2 plans 15, assignments/reservations | UNCHANGED |
| BILL-3 subscriptions | UNCHANGED (0) |

## Remaining risks

RPCs are not used by the production app yet. First `billing_admin` still requires a **separate explicit bootstrap** (not done). Branch is not merged to main. Do not start BILL-4B from this apply.

## Recommendation

BILL-4A production **schema foundation READY**. Next: Hassan review before BILL-4B. No production billing_admin. No further production change from this sprint.
