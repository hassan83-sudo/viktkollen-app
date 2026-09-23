# BILL-4C2b1 — Threshold selection & cost summary matching

Status: **READY (pairing only — no final safety decision)**  
Base: `20352466157ccd075111ad3d81e51113d73912ee`

No live enforcement, no 4C2b2, no migration, no new API route.

## Selection rules

`selectApplicableCostThresholds({ featureId, costDriving, thresholds })`

- Canonical BILL-4B `featureId` required. Unknown → `unknown_feature`.
- `enabled !== true` → ignored.
- `LOCAL_FREE` or `costDriving === false` → `NO_APPLICABLE_COST_THRESHOLD`, zero selected. Unrelated GLOBAL/FEATURE cost limits are not applied.
- Cost-driving known features: include every enabled **GLOBAL** row plus **FEATURE** rows whose `feature_id` matches. Other features ignored.
- Currency must be `SEK`. Period `DAILY`/`MONTHLY`. Scope `GLOBAL`/`FEATURE`. Mode `SOFT_ALERT`/`HARD_STOP`. Invalid enabled config → fail-safe throw (`invalid_cost_*`).
- Client `threshold` / `currentCost` / `underLimit` / `classification` ignored.

Identity comes from persisted/store rows (`threshold_id`, uniqueness `scope|feature|period|limit_mode`), not client-invented configs.

## Max relevant thresholds

Uniqueness allows at most **8** applicable rows for one cost-driving feature:

4 GLOBAL (DAILY/MONTHLY × SOFT/HARD) + 4 FEATURE for that id.

## Summary keys

`costSummaryKey`:

- `GLOBAL::<period>`
- `FEATURE:<canonical_feature_id>:<period>`

SOFT and HARD that share scope+period(+feature) share one key. Daily never maps to monthly. Global never maps to a feature summary. Feature A never uses Feature B.

## Dedup / max queries

`buildCostSummaryPlan` collapses to unique aggregation requirements.

Max **4** unique summaries / aggregator calls:

- GLOBAL DAILY
- GLOBAL MONTHLY
- FEATURE DAILY
- FEATURE MONTHLY

`collectCostThresholdSummaries` calls BILL-4C2a `getCostSummary` once per requirement. Server `clock` / optional test `now`; client `now` is not authority. Queries stay period-bounded inside 4C2a. No `COST_HARD_STOP` / `COST_SOFT_ALERT` orchestration result.

## Classification

Pass-through from 4C2a: MEASURED / ESTIMATED / UNAVAILABLE. ESTIMATED is not upgraded. UNAVAILABLE stays `amount_minor: null`, not 0. Known empty windows stay MEASURED 0.

## Limitations (unchanged)

- Historical cost: **PARTIAL** (catalog recompute at `occurred_at`, no per-event money snapshot).
- 50K foundation: **PARTIAL** (bounded rows still priced in-app).

## Remaining work (BILL-4C2b2)

Strictest relevant HARD_STOP (and soft alerts) using `resolveCostSafety` per pair. Do not start that here.
