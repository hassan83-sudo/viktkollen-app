# BILL-4C1a — Cost safety model & threshold decisions

Status: **READY (model only)**  
Base: BILL-4B production `5a5a997d385ef0de97a924651764d571196ad2e4`  
Scope: pure decision model. No DB, admin mutation, audit, live usage, provider, quota, subscription, payment, migration, or BILL-4C1b.

## BILL-1 classification reuse

BILL-1 already defines usage classification as `USAGE_BASIS`:

- `MEASURED`
- `ESTIMATED`
- `UNAVAILABLE`

BILL-4C1a reuses that list as `COST_SAFETY_CLASSIFICATION`. There is no parallel cost classification.

BILL-1 `COST_BASIS` remains `ESTIMATED | UNAVAILABLE` for catalog price rows. Cost-safety decisions use the usage/summary classification (`USAGE_BASIS`), not a new enum.

Hard rule: **UNAVAILABLE is never 0 kr, never free, never safe, never “under threshold”.**

## Money representation

Authoritative money is **integer minor units**. For SEK that is **öre**.

- 9 kr = `900`
- No floating-point money authority
- Values must be integers in `[0, Number.MAX_SAFE_INTEGER]`
- Negative amounts: **BLOCKED**
- Non-integers: **BLOCKED**
- Overflow / non-safe integers: **BLOCKED**

## Currency

This foundation’s default/authoritative threshold currency is **SEK**.

- Thresholds in BILL-4C1a must use `SEK`
- Current cost must match the threshold currency
- SEK threshold + USD (or EUR) cost → `INVALID_COST_INPUT` (`currency_mismatch`)
- **No FX engine.** No implicit conversion. Do not mix currencies in one comparison.

## Periods

Canonical threshold periods:

- `DAILY`
- `MONTHLY`

These are distinct from BILL-2 `BILLING_INTERVALS` (`day` / `week` / `month`). Unknown period: **BLOCKED**.

Daily threshold compares only to a daily cost summary. Monthly only to monthly. Mismatch → `INVALID_COST_INPUT` (`period_mismatch`).

## Scope

Canonical scopes:

- `GLOBAL` — total relevant cost for that period/currency. Must use a global aggregate summary, not a single feature row.
- `FEATURE` — one canonical `feature_id` from BILL-4B.

Unknown scope: **BLOCKED**. Scope mismatch (global vs feature): `INVALID_COST_INPUT` (`scope_mismatch`).

Feature-scoped thresholds must use the **canonical** BILL-4B id (example: `food.scan`). Aliases (`food_scan`) and unknown ids: **BLOCKED**. Feature mismatch: `INVALID_COST_INPUT` (`feature_mismatch`).

The data model is compatible with later combinations (global daily, global monthly, feature daily, feature monthly). BILL-4C1a does **not** orchestrate multiple thresholds.

## Limit modes

- `SOFT_ALERT` — threshold reached/exceeded returns `COST_SOFT_ALERT` but **does not** stop the operation solely because of the soft limit (`allow: true`).
- `HARD_STOP` — threshold reached/exceeded returns `COST_HARD_STOP` and **denies** a new cost-driving operation (`allow: false`).

Unknown mode: **BLOCKED**.

## Result codes

| Code | Meaning |
| --- | --- |
| `COST_SAFE` | Known cost is under the threshold, or the operation is not cost-driving |
| `COST_SOFT_ALERT` | Known cost ≥ soft threshold; operation not hard-blocked |
| `COST_HARD_STOP` | Known cost ≥ hard threshold; cost-driving operation denied |
| `COST_UNAVAILABLE` | Cost is unknown; never represented as 0 |
| `INVALID_COST_INPUT` | Currency / period / scope / feature mismatch (fail-safe, `allow: false`) |

Malformed numbers/enums throw (`invalid_*`) rather than inventing a safe default.

## Boundary rule

Used everywhere for known integer cost:

- `current < threshold` → under limit
- `current >= threshold` → threshold **reached**

## Zero threshold

**Valid.** `amount_minor: 0` is an explicit limit.

For `HARD_STOP`, `0 >= 0` is reached: the first known cost-driving observation (including measured 0) is `COST_HARD_STOP`.

## ESTIMATED policy (conservative)

ESTIMATED **may** be compared to the threshold the same way as MEASURED (same currency/period/scope).

- Result codes follow the same `<` / `>=` rule
- `estimated: true` always
- `classification` remains `ESTIMATED`
- `metering_complete: false`
- The result must not claim the cost is measured

Conservative hard-stop: estimated cost at/over the hard threshold **is** `COST_HARD_STOP`.

## UNAVAILABLE policy

| Context | Result | `allow` | Amount |
| --- | --- | --- | --- |
| `SOFT_ALERT` | `COST_UNAVAILABLE` | `true` | `null` (never 0) |
| `HARD_STOP` | `COST_UNAVAILABLE` | `false` | `null` (never 0) |

UNAVAILABLE + `HARD_STOP` is **never** `COST_SAFE`. Fail-safe: a cost-driving operation that needs known cost is denied until cost is known.

## Cost-driving / LOCAL_FREE

The resolver may receive `feature` and `costDriving`.

- `LOCAL_FREE` features (example: `friend_chat`) are **not** blocked by an external cost threshold. Result: `COST_SAFE`, reason `not_cost_driving`.
- `costDriving: false` is treated the same (local/free or otherwise non-cost-driving).
- Client flags `costSafe` / `underLimit` are **ignored**.

## PARTIAL metering

PARTIAL features (example: `tts.request`) must not claim full cost coverage (`metering_complete: false`).

If classification is `UNAVAILABLE`, apply the UNAVAILABLE policy above. Do not invent a measured total.

## Resolver

Pure function: `resolveCostSafety({ threshold, costSummary, feature, costDriving, clientClaim })`.

- No DB read/write
- No quota reservation
- No subscription mutation
- No provider call
- No notification
- Returns a decision object only

Helpers: `assertCostThreshold`, `assertCostSummary`.

## Later multi-threshold priority (not implemented)

When BILL-4C2 (or later) evaluates several applicable limits, choose the **strictest relevant HARD_STOP**. Soft alerts may still be returned alongside that, but orchestration is out of BILL-4C1a.

## Not in this sprint

- Persistence / migration (`BILL-4C1b`)
- `setCostThreshold` admin mutation
- Audit actions
- Live BILL-1 usage aggregation
- Full operational/access resolver
- Admin dashboard
- Payment

## Tests

Focused file: `src/services/billing/costSafety.test.js` (measured/estimated/unavailable, zero, negatives, floats, mismatches, local-free, partial, client spoof).

Regression: BILL-4B, BILL-4A, BILL-3, BILL-2, BILL-1 billing tests. No staging/production SQL.
