# BILL-4C2a — Authoritative cost aggregation

Status: **READY (model + bounded query; no live enforcement)**  
Base: BILL-4C1b `630ce09123f51678e15ed20dfba48eaa27d9df2c`

No staging/production SQL. No new migration. No BILL-4C2b.

## Authoritative source

BILL-1 `billing.usage_events` (runtime: in-memory repository until that migration is applied):

- `event_type`, `feature`, `provider`, `model`, `unit`, `quantity`, `occurred_at`
- `cost_basis` on the row is `ESTIMATED` | `UNAVAILABLE` (no money column)
- `metadata.usage_basis` is quantity provenance (`MEASURED` / `ESTIMATED` / `UNAVAILABLE`), **not** money

Money is produced by BILL-1 `estimateUsageCost` against the integer catalog, using **`occurred_at` as the economic timestamp** (`effective_from` / `effective_to`). Default production catalog rows are `UNCONFIGURED` → `UNAVAILABLE`. There is no stored invoice snapshot.

Canonical feature IDs reuse BILL-1 `event_type` for metered features (`knownMeteredEventTypes()` / `USAGE_EVENT_TYPES`). No parallel mapping.

Client `currentCost` / `totalCost` / `costMinor` / `estimatedCost` / `underLimit` / `now` are ignored.

## Period boundaries (UTC)

Reuse BILL-2 `periodBounds` (`start` inclusive, `end` exclusive).

| Period | Bounds |
| --- | --- |
| `DAILY` | UTC midnight → next UTC midnight |
| `MONTHLY` | 1st of UTC calendar month → 1st of next month |

Not a rolling 30-day window. February is 28 or 29 days. Client timezone is not authority.

Current period uses trusted `clock()` (server). Tests may pass `now`. Production must not take client `now`.

## Global vs feature

- **GLOBAL**: one bounded query over all `USAGE_EVENT_TYPES` in `[period_start, period_end)`. System-level, not per-user N+1.
- **FEATURE**: same window, `event_type = canonical feature_id` when the feature has a BILL-1 event type.
- Unknown feature: `unknown_feature`.
- `LOCAL_FREE` (no event type): known unmetered → `MEASURED` / `0`.
- Umbrella `PARTIAL` without event type (`smart_ai`): **UNAVAILABLE** (cannot determine cost).

## Classification precedence

For **money** components (catalog estimate):

`UNAVAILABLE` > `ESTIMATED` > `MEASURED`

| Case | Summary |
| --- | --- |
| Known coverage, **no events** | `MEASURED`, `amount_minor = 0` (not unknown) |
| Every event prices to integer SEK öre | `ESTIMATED` (catalog price is not an invoice) |
| Any event unconfigured / missing FX / invalid qty or unit | `UNAVAILABLE`, `amount_minor = null` (never 0) |

BILL-1 cannot emit **measured money**. `usage_basis = MEASURED` does **not** upgrade a catalog price to `MEASURED`. Empty known windows are the MEASURED-zero path.

## Historical cost

Lookup uses `event.occurred_at`, not aggregator `now`. A July `now` does not reprice an April event with the June catalog row if that event is outside the queried April day. Limitation: there is still no persisted per-event money snapshot; we recompute from catalog history. If a catalog row is later deleted, historical aggregation can change — documented BILL-1 gap.

## Rounding

`multiplyMinorCost`: integer/BigInt, round half away from zero. Aggregation sums integer öre with BigInt; overflow beyond `Number.MAX_SAFE_INTEGER` → `UNAVAILABLE`. No float totals. No FX in 4C2a (USD catalog without FX → `UNAVAILABLE`, matching 4C1a SEK-only safety).

## Output / 4C1a handoff

`getCostSummary({ period, scope, featureId, now, catalog, repository, clock, clientClaim })`

Fields: `classification`, `amount_minor` (null if unavailable), `currency` (`SEK`), `period`, `scope`, `feature_id` (FEATURE only), `period_start`, `period_end`.

Pass the object to `resolveCostSafety({ costSummary, threshold, feature })`. Aggregator never returns `COST_HARD_STOP` / `SOFT_ALERT`. Thresholds are not read or written.

## Query strategy / indexes / 50k

Intended SQL (not applied): `occurred_at >= $start AND occurred_at < $end AND event_type = ANY($types)` on `usage_events_type_occurred_idx`. No full-table scan, no per-user loop for GLOBAL. In-memory tests filter the same bounds. Later 4C2b can `SUM` in Postgres; 4C2a still prices in the app because money is not stored on the row.

## Privacy

Selected columns are billing metadata only. Prompt, response, audio, image, GPS, chat, passwords, and API keys are not read.

## Remaining work (BILL-4C2b)

- Orchestrate persisted thresholds + this summary + `resolveCostSafety`
- Optional SQL `SUM` once money snapshots exist
- Live route enforcement
- Per-user windows if product needs them

Do not start BILL-4C2b in this sprint. Do not apply migrations.
