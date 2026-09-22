# BILL-4B — Production feature + provider control schema foundation

Branch: `billing-cost-metering-sprint1`
Base staging: `227ac45cfe73c5c3c6cd5345b4fc83bbfe77bcd8`
Migration: `supabase/migrations/20260921230000_billing_feature_controls.sql`
Checksum: `cf9a6b2a0ed55c8e925ea12a9747b23aaa3011b7` (matches BILL-4B staging)

Connection: gitignored `.env.production.local` only (Session pooler). Staging `.env.local` was not used as a URI. Production app, Vercel, and `main` were not changed.

**No production billing_admin.** No feature_controls rows. No provider_controls rows. No audit testdata. No kill switch activated. Known features/providers keep BILL-4B1/4B2a no-row defaults.

## Prechecks

| Check | Result |
| --- | --- |
| TARGET | PRODUCTION |
| Production ref = database target | PASS |
| Production ≠ staging | PASS |
| SELECT 1 / TLS / auth | PASS |
| Checksum | PASS (`cf9a6b2a0ed55c8e925ea12a9747b23aaa3011b7`) |
| BILL-1 `billing.usage_events` | PASS |
| BILL-2 plans/quota | PASS |
| BILL-3 subscriptions | PASS |
| BILL-4A admin tables/RPC | PASS |
| Pre-existing BILL-4B objects | NO |
| Collision | PASS |
| Recovery (WAL archive present, not in recovery) | VERIFIED |

## Apply

Exact file only, one transaction: **COMMITTED**. No other migrations. No BILL-1/2/3/4A replay.

## Post-verify (read-only)

Tables added: `feature_controls`, `provider_controls` (BILL-1/2/3/4A tables still present).

Functions: `set_feature_control`, `set_provider_control`, guards; `append_admin_audit` / `admin_audit_snapshot` replaced with 4B allowlists.

| Check | Result |
| --- | --- |
| RLS + FORCE RLS | PASS |
| anon/authenticated raw table access | BLOCKED (catalog) |
| `service_role` SELECT only; no table INSERT | PASS |
| RPC EXECUTE setters `service_role` only; append not granted | PASS |
| SECURITY DEFINER + `search_path` pg_catalog, pg_temp | PASS |
| Feature allowlist (12 canonical IDs) | PASS |
| Provider allowlist `openai` / `google.cloud_run.ai_ear` | PASS |
| Feature modes ENABLED/DISABLED/MAINTENANCE | PASS |
| Provider modes AVAILABLE/UNAVAILABLE/MAINTENANCE | PASS |
| Feature/provider CAS (`UPDATE … WHERE version = expected`, unique create) | PASS |
| Audit actions retain 4A grant/revoke + 4B feature/provider | PASS |
| Audit append-only trigger | PASS |
| Snapshot nested/sensitive/size (+ secret) | PASS |
| No api_key/secret/token/password columns | ABSENT |
| Indexes PK + BILL-4A audit indexes | PASS |
| `feature_controls` rows | **0** |
| `provider_controls` rows | **0** |
| `admin_permissions` rows | **0** |
| `admin_audit` rows | **0** (unchanged) |
| BILL-1 usage count | UNCHANGED (0) |
| BILL-2 plans 15 | UNCHANGED |
| BILL-3 subscriptions | UNCHANGED (0) |

## Remaining risks

RPCs are not used by the production app yet. No admin bootstrap. Empty control tables mean all known features/providers stay at documented defaults. Branch is not merged to main. Do not start BILL-4C from this apply.

## Recommendation

BILL-4B production **schema foundation READY**. Next: Hassan review before BILL-4C. No production billing_admin. No further production change from this sprint.
