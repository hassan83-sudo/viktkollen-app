# BILL-4C1b — Cost threshold persistence, admin CAS & audit

Status: **READY (local schema only — not applied)**  
Base: BILL-4C1a `2c4e4182bff1cd0811fb62bc0e8c76f079066b09`

Scope: persist audited cost thresholds. No live usage aggregation, no multi-threshold orchestration, no quota, subscription, provider, payment, dashboard, staging SQL, or production SQL.

## Schema

Local file: `supabase/migrations/20260922000000_billing_cost_safety.sql`

Table `billing.cost_thresholds`:

| Column | Notes |
| --- | --- |
| `threshold_id` | UUID, DB-generated |
| `scope` | `GLOBAL` / `FEATURE` |
| `feature_id` | NULL iff GLOBAL; canonical BILL-4B id iff FEATURE |
| `period` | `DAILY` / `MONTHLY` |
| `limit_mode` | `SOFT_ALERT` / `HARD_STOP` |
| `amount_minor` | bigint öre, `>= 0` and `<= 9007199254740991` |
| `currency` | `SEK` only |
| `enabled` | boolean; disabled rows are not active |
| `version` | integer `>= 1` |
| `updated_at` | DB `now()` |
| `updated_by` | verified billing_admin UUID |

Do **not** apply this migration to staging or production in this sprint.

## Money

Authoritative money is integer minor units (SEK öre). No float. Application and SQL both reject negatives and values outside JS safe-integer range.

## Uniqueness

One current row per identity:

`scope + coalesce(feature_id, '') + period + limit_mode`

SOFT_ALERT and HARD_STOP may coexist for the same scope/period. Duplicate identity → `CONFIG_CONFLICT`.

## Immutable identity

After create, these cannot change via update:

- `scope`
- `feature_id`
- `period`
- `limit_mode`
- `currency`
- `threshold_id`

Mutable allowlist: `amount_minor`, `enabled` (plus CAS `expected_version`). To change identity, create a new config.

## CAS / version

- First create: `version = 1`
- Successful update: `N → N+1`
- Update requires `expected_version`
- Stale: `CONFIG_CONFLICT`, no mutation, no successful-change audit
- Production CAS: `UPDATE ... WHERE threshold_id = $id AND version = expected` inside SECURITY DEFINER RPC
- Concurrent first create: unique index + `unique_violation` → `CONFIG_CONFLICT`

In-memory store is tests-only, not production authority.

## Admin authority

Mutations require verified `billing_admin` via existing BILL-4A `has_billing_admin`. No bootstrap insert of admin rows. Client `isAdmin` / `role=admin` is ignored. `updated_by` is the verified actor. `updated_at` is server/DB time.

Trusted operations:

- `createCostThreshold({ scope, featureId, period, limitMode, amountMinor, currency, enabled })`
- `updateCostThreshold({ thresholdId, expectedVersion, amountMinor, enabled })`

PostgreSQL: `billing.create_cost_threshold`, `billing.update_cost_threshold`. EXECUTE is `service_role` only. PUBLIC/anon/authenticated revoked.

## Audit

Successful create/update: exactly one BILL-4A audit row in the **same transaction** as the threshold mutation. Audit failure rolls back the mutation.

| Field | Value |
| --- | --- |
| action | `cost.threshold.created` / `cost.threshold.changed` |
| target_type | `cost_threshold` |
| target_id | `threshold_id` |

Safe snapshot allowlist: `threshold_id`, `scope`, `feature_id`, `period`, `limit_mode`, `amount_minor` (integer), `currency`, `enabled`, `version`. No arbitrary keys. No health/prompt/GPS/secrets/payment credentials.

Stale CAS writes no change audit.

## RLS

FORCE RLS + restrictive deny-all for `public`. Table grants: revoke all including service_role, then **SELECT** only to `service_role`. Mutations go through RPC, not frontend table CRUD.

## Read adapter

`listActiveCostThresholds()` returns `enabled = true` only. Maps to BILL-4C1a via `toResolverThreshold(row)` (`limit_mode` → `mode`). No usage-event summation.

## Resolver integration

Persisted HARD_STOP + a fixture `costSummary` can be passed to `resolveCostSafety(...)`. Resolver remains pure (no DB write).

## Indexes / 50k

Active lookup indexes on `(enabled, scope, period, limit_mode)` and feature-scoped equivalent. Thresholds are a small global config set — no per-user N+1.

## Privacy

Persistence and audit must not store health data, prompt, response, audio, image, GPS, provider secrets, or payment credentials. Extra keys `api_key` / `secret` / `token` / `password` / `prompt` are rejected.

## Remaining work (BILL-4C2)

- Live BILL-1 usage aggregation
- Multi-threshold orchestration (strictest HARD_STOP)
- Live route enforcement
- Staging/production apply of this migration (separate review)

Do not start BILL-4C2 in this sprint. Do not apply this SQL.
