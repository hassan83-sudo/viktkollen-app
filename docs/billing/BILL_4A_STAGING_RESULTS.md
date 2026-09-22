# BILL-4A — Staging live admin authority & audit

Branch: `billing-cost-metering-sprint1`
Base: `a87c2157827f4718f4c195b1a85898a78892fcff`
Migration: `supabase/migrations/20260921220000_billing_admin_authority.sql`
**Checksum (`git hash-object`): `d8cc1f98e68d8cbbf8b8e26775e2052d6719bf68`**

Target: staging Session pooler from gitignored `.env.local` only.
`.env.production.local` was not used. Production was not contacted.
`BILLING_TEST_TARGET=staging`; staging project ref matched the pooler user; staging ref ≠ production ref.

Apply: **COMMITTED** in one transaction. BILL-1/2/3 objects were present; BILL-4A tables/RPCs were absent beforehand (`COLLISION_CHECK: PASS`). No db reset. No other migration.

## Schema created

Tables: `billing.admin_permissions`, `billing.admin_audit`.

Functions: `has_billing_admin`, `grant_billing_admin`, `revoke_billing_admin`, `append_admin_audit`, `admin_audit_snapshot`, `guard_admin_permission_row`, `guard_admin_audit_row`.

Indexes: `admin_permissions_user_permission_uidx`, `admin_permissions_user_active_idx`, `admin_audit_created_idx`, `admin_audit_admin_idx`, `admin_audit_action_idx`.

RLS + FORCE RLS on both new tables. `service_role` SELECT only; mutations via SECURITY DEFINER. `append_admin_audit` EXECUTE not granted to `service_role`. PUBLIC/anon/authenticated EXECUTE revoked.

## Live security

| Check | Result |
| --- | --- |
| JWT via `verifySupabaseUser` → `auth.getUser(token)` | PASS |
| anon/authenticated raw SELECT/INSERT/UPDATE/DELETE on both tables | BLOCKED |
| Normal user admin guard | BLOCKED |
| Body spoof `isAdmin` / `role` / `billing_admin` | BLOCKED |
| `admin_user_id` spoof | BLOCKED; stored actor is verified admin |
| Self-grant / cross-user grant via PostgREST RPC | BLOCKED |
| Fabricated audit INSERT | BLOCKED |
| Staging owner bootstrap of one synthetic admin | PASS (staging only) |
| Verified admin GET session | PASS |
| ACTIVE only; revoke then guard DENY | PASS |
| Trusted grant: one permission row + one grant audit | PASS |
| Duplicate grant: still one row, no extra audit | BLOCKED |
| Two real `pg.Client` concurrent grants same user | PASS, one row |
| Concurrent grants two different users | both created; **GLOBAL LOCK: NO** |
| Permission change + audit same SQL function | PASS |
| Trusted revoke + revoke audit | PASS |
| Re-grant + second grant audit | PASS |
| Permission DELETE trigger / client UPDATE | BLOCKED |
| Audit UPDATE/DELETE | BLOCKED |
| Unknown action / target_type / reason | BLOCKED |
| Dummy sensitive + nested + oversized snapshots | BLOCKED |
| Unknown permission / status | BLOCKED |
| Social `ADMIN_USER_ID` not billing_admin | NO bridge |
| Service role on Vite/client/logs | NO |

Synthetic Auth users `bill4a-*@invalid.example` and UUID permission rows. Audit history is append-only; leftover staging rows were **left in place** (no trigger weakening for cleanup).

## 50k foundation

Indexed user+permission unique, ACTIVE partial lookup, audit `created_at` / `admin_user_id` / `action`. No load test. `has_billing_admin` is a point lookup, not a full-table scan.

## BILL-1 / 2 / 3

`usage_events`, plans/quota, and `subscriptions` still present. BILL-4A did not ALTER them.

## Remaining risks

- Runtime production API is not yet wired to these RPCs (in-memory default-deny until a later wire-up).
- Staging retains synthetic admin permission/audit rows.
- First production admin still requires a later trusted owner insert, not this sprint.

## Recommendation

**APPROVE FOR SEPARATE PRODUCTION STEP** after Hassan review of this checksum (`d8cc1f98e68d8cbbf8b8e26775e2052d6719bf68`).
Do not apply to production from this sprint. BILL-4B not started.
