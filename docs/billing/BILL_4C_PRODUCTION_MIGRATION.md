# BILL-4C — Production cost safety schema foundation

Branch: `billing-cost-metering-sprint1`
Base staging: `4388ddcd76b99cc18e766d0036704874d7df9cff`
Migration: `supabase/migrations/20260922000000_billing_cost_safety.sql`
Checksum: `67d4de0f061477bacb52646fca6195d6eec94ec7` (matches BILL-4C staging)

Connection: gitignored `.env.production.local` only (Session pooler). Staging `.env.local` was not used as a URI. Production app, Vercel, and `main` were not changed.

**No production billing_admin.** No cost_thresholds rows. No audit testdata. No HARD_STOP/SOFT_ALERT activated. No live enforcement.

## Prechecks

| Check | Result |
| --- | --- |
| TARGET | PRODUCTION |
| Production ref = database target | PASS |
| Production ≠ staging | PASS |
| SELECT 1 / TLS / auth | PASS |
| Checksum | PASS (`67d4de0f061477bacb52646fca6195d6eec94ec7`) |
| BILL-1 `billing.usage_events` | PASS |
| BILL-2 plans/quota | PASS |
| BILL-3 subscriptions | PASS |
| BILL-4A admin tables/RPC | PASS |
| BILL-4B feature/provider controls | PASS |
| Pre-existing BILL-4C objects | NO |
| Collision | PASS |
| Recovery (WAL archive present, not in recovery) | VERIFIED |

## Apply

Exact file only, one transaction: **COMMITTED**. No other migrations. No BILL-1/2/3/4A/4B replay. No writes after COMMIT except this apply.

## Post-verify (read-only)

Table added: `cost_thresholds`. BILL-1/2/3/4A/4B tables still present.

Functions: `create_cost_threshold`, `update_cost_threshold`, `list_active_cost_thresholds`, `guard_cost_threshold_row`; `append_admin_audit` / `admin_audit_snapshot` include 4C actions.

| Check | Result |
| --- | --- |
| RLS + FORCE RLS | PASS |
| anon/authenticated raw table access | BLOCKED (catalog) |
| `service_role` no table SELECT/INSERT/UPDATE/DELETE | PASS |
| RPC EXECUTE create/update/list `service_role` only; append not granted | PASS |
| SECURITY DEFINER + `search_path` pg_catalog, pg_temp | PASS |
| Money `amount_minor >= 0` bigint | PASS |
| Currency SEK | PASS |
| Period DAILY/MONTHLY | PASS |
| Scope GLOBAL/FEATURE + consistency | PASS |
| Canonical feature allowlist | PASS |
| Limit modes SOFT_ALERT/HARD_STOP | PASS |
| UNIQUE NULLS NOT DISTINCT identity | PASS |
| CAS `UPDATE … WHERE version = expected` + unique create | PASS (definition only; no race writes) |
| Identity immutability / not deletable | PASS |
| updated_by actor / updated_at `now()` | SERVER AUTHORITATIVE |
| Audit 4A+4B+4C actions/targets | PASS |
| Audit append-only trigger | PASS |
| Snapshot sensitive-key reject | PASS |
| No secret columns on threshold table | ABSENT |
| Indexes PK + identity + active lookup | PASS |
| `cost_thresholds` rows | **0** |
| `admin_permissions` rows | **0** |
| `admin_audit` rows | **0** (unchanged) |
| BILL-1 usage count | UNCHANGED (0) |
| BILL-2 plans 15 | UNCHANGED |
| BILL-3 subscriptions | UNCHANGED (0) |
| BILL-4B feature/provider rows | UNCHANGED (0) |

## Remaining limitations

HISTORICAL TIMESTAMP: PARTIAL
HISTORICAL COST: PARTIAL
50K FOUNDATION: PARTIAL

RPCs are not used by the production app yet. Empty threshold table means no cost kill switch is active. Branch is not merged to main.

## Recommendation

BILL-4C production **schema foundation READY**. Next: Hassan review. Do not start the next billing sprint. Do not wire live HARD_STOP. No further production change from this sprint.
