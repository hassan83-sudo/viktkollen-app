# BILL-5B3C — Operable BILL-4B kill switches

Branch: `billing-cost-metering-sprint1`  
Base: `4ea26baff3cf0be52525e8f4ef33b325297c0a1c`

HIGH #2 from BILL-5B3: feature/provider controls existed in Postgres (`billing.set_feature_control` / `billing.set_provider_control`) but `/api/billing/admin` only implemented in-memory `grant` / `revoke`. This sprint reuses that route. No new API function.

## Route

`GET|POST /api/billing/admin`

Existing:

- `GET` — session if `requireBillingAdmin` passes
- `POST action=grant` — grant `billing_admin`
- `POST action=revoke` — revoke `billing_admin`

Added (explicit, separate actions):

- `POST action=set_feature_control`
- `POST action=set_provider_control`

Client `rpc`, `schema`, `table`, `sql`, `isAdmin`, `role`, and `billing_admin` fields are ignored. They never select an RPC.

## Allowlist

HTTP kill-switch IDs are narrower than the SQL catalog:

| Kind | Id | States |
| --- | --- | --- |
| feature | `food.scan` | `ENABLED`, `DISABLED` |
| provider | `openai` | `AVAILABLE`, `UNAVAILABLE` |

`MAINTENANCE`, aliases (`food_scan`), and other canonical features/providers are rejected on this surface (`UNKNOWN_FEATURE` / `UNKNOWN_PROVIDER` / `INVALID_CONTROL_STATE`).

Default reasons when omitted: disable → `SECURITY`; enable → `MANUAL_ADMIN`; unavailable → `PROVIDER_OUTAGE`; available → `MANUAL_ADMIN`.

## Authorization

Same BILL-4A gate: verified Supabase JWT, then `billing.has_billing_admin` when a durable adapter is available (otherwise the injected/in-memory permission store used by tests). Client-supplied user id, role, plan, or feature state does not grant admin. Unauthorized → no RPC.

## Durable persistence

Production adapter: `createPostgresBillingControlAdapter` → `client.schema('billing')`:

- RPC `set_feature_control` / `set_provider_control` (write + audit inside SQL)
- SELECT `feature_controls` / `provider_controls` (read-back)
- RPC `has_billing_admin` (auth)

Not a process `Map`. If the adapter cannot be resolved, mutation returns `503 ADMIN_STORE_UNAVAILABLE` and does not return a successful control object.

## Read-back

POST 200 includes `{ control: { feature_id|provider_id, mode, reason_code, version } }` after a SELECT. Operators should treat that row as the durable state.

## Fail-closed food.scan

`evaluateBillingOperation` runs feature/provider gates before quota reserve and before dispatch CAS. Disabled `food.scan` or unavailable `openai` → deny, provider `fetch` 0.

## Emergency canary stop

1. Authenticated `billing_admin` session (`GET /api/billing/admin`).
2. `POST { "action": "set_feature_control", "feature_id": "food.scan", "mode": "DISABLED" }`  
   and/or `{ "action": "set_provider_control", "provider_id": "openai", "mode": "UNAVAILABLE" }`.
3. Confirm `control.mode` in the JSON body.
4. Re-enable with `ENABLED` / `AVAILABLE` and `expected_version` equal to the current version.

This does **not** close HIGH #1 (PostgREST `billing` exposure) or HIGH #3 (production `SUPABASE_SERVICE_ROLE_KEY` still absent). Production canary remains **DO NOT APPROVE**. Production and staging controls were not mutated in this sprint.
