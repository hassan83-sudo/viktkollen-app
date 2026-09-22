# BILL-4C-SEC1b — Cost decision security

Status: **READY** (decision-chain review; no live enforcement)
Base: `8ec9ae3e81f0e2ed7d370ad66a596892ecb1203b`

SEC1a remains the unapplied DB boundary. This sprint does not apply it.

## Canonical feature authority

`resolveFeatureId` / `BILLING_FEATURES` only. Aliases are not accepted as the raw `featureId` at the decision boundary (`canonical !== raw` → `unknown_feature`). Client cannot invent features.

## costDriving authority

**FIXED (CRITICAL):** `costDriving=false` from the caller is ignored.

`isCostDrivingFeature()` is server-only:

- `LOCAL_FREE` → not cost-driving
- `EXTERNAL_COST` and `PARTIAL` → cost-driving

Used by `selectApplicableCostThresholds` and `resolveCostSafety`. Client `classification` (including `LOCAL_FREE`) is ignored.

## LOCAL_FREE / PARTIAL

Canonical LOCAL_FREE: no applicable cost thresholds (`NO_APPLICABLE_COST_THRESHOLD`). Unrelated GLOBAL/FEATURE spend limits do not block it.

PARTIAL is never treated as LOCAL_FREE. HARD + UNAVAILABLE → deny.

FEATURE summaries for features without `event_type` (LOCAL_FREE and `smart_ai`) are `UNAVAILABLE`, not measured 0.

## Cost summary / classification

`getCostSummary` uses BILL-1 usage + catalog. Client `amount_minor` / `currentCost` / `totalCost` / `estimatedCost` / `classification` / `underLimit` / `now` are voided.

Server merge: UNAVAILABLE > ESTIMATED > MEASURED. UNAVAILABLE `amount_minor` is `null`, never 0. Empty bounded window: MEASURED 0. Unknown catalog/unit/price: UNAVAILABLE.

## Money / rounding

Integer öre via `bigint` accumulation and `multiplyMinorCost` (integer division, half-up). No float totals. Overflow → UNAVAILABLE (not a silent undercount).

## Period / server time

UTC calendar day/month, start inclusive, end exclusive (`periodBounds`). Production `clock()`; explicit test `now` only. Client `now` is not period authority.

## Historical timestamp / cost

Aggregation trusts stored `occurred_at`. Insert-time authority remains BILL-1 `createUsageEvent` (test fixtures may set `occurred_at`). **PARTIAL:** money is catalog-repriced at `occurred_at`, not snapshotted on the event.

## Bounded query

`listInPeriod` requires `period_start`, `period_end`, and `eventTypes[]` (`unbounded_usage_query` otherwise). Postgres SQL matches `occurred_at` range + `event_type = any(...)`.

GLOBAL: all canonical `USAGE_EVENT_TYPES` (no client filter). FEATURE: exact canonical `event_type`.

## Thresholds / pairing

Enabled rows only. GLOBAL + matching FEATURE. Max **8** configs → max **4** unique summaries (SOFT+HARD share a key). No DAILY↔MONTHLY, GLOBAL↔FEATURE, or feature A↔B crossover. `limit_mode` from 4C2b1 is accepted by 4C1a (`mode || limit_mode`).

Client cannot choose threshold amount/mode/scope/period; evaluation uses selected persisted rows.

## Final precedence

`INVALID_COST_INPUT` (deny) > `COST_HARD_STOP` (deny) > HARD `COST_UNAVAILABLE` (deny) > `COST_SOFT_ALERT` (allow) > SOFT `COST_UNAVAILABLE` (allow) > `COST_SAFE`.

HARD reached or HARD unavailable never allow. Multiple soft alerts: one final `COST_SOFT_ALERT` with all triggered rows.

## User identity

Cost aggregation is **platform/global spend**, not per-user quota (BILL-2). Queries are not scoped by client `user_id`. Cross-user quota leakage is **not applicable** to this boundary.

## Safe / error output

Decision payload is allowlist metadata only. Errors throw short codes (`unknown_feature`, `unbounded_usage_query`, …), not SQL, URLs, or `service_role`.

## Side effects / live enforcement

Evaluation does not write usage, thresholds, audit, quota, subscription, or call providers. `resolveFinalCostSafety` is **not** wired into OpenAI / AI Ear / meal / body routes. BILL-4B provider availability stays a separate resolver.

## 50K foundation

**PARTIAL.** Summaries still load bounded usage rows into Node and price them in-process. Later: DB rollups / materialized aggregates / per-event cost snapshots. Not in this sprint.

## Findings

| ID | Severity | Status | Notes |
| --- | --- | --- | --- |
| F1 | CRITICAL | FIXED | Caller `costDriving=false` skipped thresholds for EXTERNAL_COST. |
| F2 | HIGH | FIXED | 4C2b1 rows expose `limit_mode`; 4C1a only read `mode` — pairing could fail closed or be mis-wired. Both accepted. |
| F3 | MEDIUM | FIXED | LOCAL_FREE FEATURE summary used empty event list → MEASURED 0. Now UNAVAILABLE (no `event_type`). |
| F4 | MEDIUM | FIXED | In-memory `listInPeriod` allowed missing `eventTypes` (unbounded types). Now required. |
| F5 | INFO | ACCEPTED | Aggregation is system-wide cost, not per-user. |
| F6 | INFO | ACCEPTED | Historical catalog repricing PARTIAL; 50K PARTIAL. |

## Staging recommendation (input only)

Do not apply SEC1a SQL yet. After Hassan combined 4C verdict: apply cost_thresholds on staging, then a dedicated live-enforcement sprint. Do not merge 4B provider + 4C cost into one resolver.
