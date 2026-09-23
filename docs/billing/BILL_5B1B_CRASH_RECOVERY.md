# BILL-5B1b — food.scan persistence and crash recovery

Status: **READY** (review + adapter hardening). Live route is **not** wired.

BASE: `90363c4a446c17ff4843aa34fb071baa6bb26cbb`

No OpenAI calls. No staging/production writes. **No migration.**

## Current persistence (inventory)

| Concern | Today (before 5B2 wire) | Production authority? |
| --- | --- | --- |
| Quota reservation | BILL-2 `billing.quota_reservations` (Postgres RPC) / in-memory store in tests | Yes, when BILL-2 SQL is applied |
| Usage / cost event | BILL-1 `billing.usage_events` PK `event_id` / in-memory repo | Yes (BILL-1 live) |
| Lifecycle ledger / retry short-circuit | Node `Map` in `meteredOperationLifecycle.js` | **No** |
| `markDispatched` (5B1a) | Request-local boolean + optional Map | **No** |
| In-flight coalesce | Node `Map` keyed per isolate | Same isolate only |
| Image deduper | Node `Map`, 30s | UX only, not billing |

5B1b adds a **shareable durable store**: tests use either
`createDurableOperationStore()` (shared Map simulating Postgres) or
`createUsageBackedDispatchStore()` (BILL-1 `event_id` insert as CAS).

Production 5B2 **must** inject the usage-backed store (or equivalent SQL).
The default per-process Map is **not** production authority.

## Serverless assumption

A Vercel isolate can die at any await. The next request can land on another
isolate. In-memory Maps do not survive that. Isolate-local inflight coalescing
is keyed by `instanceKey` so two workers are not one Promise.

## Dispatch durability

Durable dispatch mark = unique insert of the BILL-1 usage event with
`event_id = operation_id`, `cost_basis: UNAVAILABLE`,
`metadata.usage_basis: UNAVAILABLE`. Duplicate insert = CAS lost → do not
send another provider call.

**SCHEMA GAP: NO.** Existing `usage_events.event_id` PK is enough for the
CAS. Optional later column `quota_reservations.dispatch_marked_at` would make
expiry queries easier; not required to start 5B2 design, and **not created
here**.

## False-dispatch window

Durable mark can succeed, then the process dies **before** bytes leave the
host. That is **not** proof OpenAI billed. State remains
`DISPATCHED_BILLING_UNKNOWN`. Conservative quota commit 1 still applies.
Cost stays **UNAVAILABLE**, never **MEASURED**.

## Ambiguous billing semantics

`DISPATCHED_BILLING_UNKNOWN` means unknown invoice, not “OpenAI definitely
charged”. Viktkollen has **no provider invoice oracle**.

## Quota vs cost

| Policy | Ambiguous post-dispatch |
| --- | --- |
| Quota | Commit 1 `requests` (may over-consume user quota if OpenAI never ran) |
| Cost event | `UNAVAILABLE` / not MEASURED |

This fairness tradeoff is explicit.

## Crash matrix

| Crash | Persisted | Retry | Provider | Quota | Usage | Recovery |
| --- | --- | --- | --- | --- | --- | --- |
| A before reserve | none | new attempt | allowed | none | none | start |
| B after reserve, before mark | PENDING | same id | allowed if no event | PENDING holds remaining until expiry | none | rollback if proven not dispatched |
| C after mark, before fetch | PENDING + usage UNAVAILABLE | **no provider** | 0 | commit 1 | exists | conservative |
| D during provider | same as C | no provider | 0 | commit 1 | exists | conservative |
| E provider success, before commit | PENDING + event | no provider | 0 | commit 1 | exists | commit only |
| F commit then missing event | COMMITTED, no event | no provider | 0 | already 1 | insert same id | usage only |
| G after usage, before HTTP | COMMITTED + event | no provider | 0 | 1 | 1 | already completed |
| H after ambiguous accounting, before HTTP | COMMITTED + UNAVAILABLE event | no provider | 0 | 1 | 1 | already completed |

PENDING expiry: expired PENDING is ignored in remaining but the row can still
be committed. A dispatched event **blocks provider retry** even if PENDING
looks expired. Expiry must not become a free second OpenAI call.

## Commit → event gap

5B1a order was commit then usage. 5B1b recovery: if COMMITTED and event
missing, insert the same `event_id`. If the usage-backed mark ran first,
the event already exists (idempotent duplicate). Quota remaining still skips
usage rows whose `event_id` is a reservation id → no double remaining.

## Cross-instance idempotency

Two isolates, shared reservation + usage backends, different `instanceKey`.
Provider body runs only for the CAS winner of `event_id` insert.

No global mutex. Per-`reservation_id` / per-`event_id` uniqueness.

Two recoverers: idempotent `commit_quota` + duplicate usage insert. Side
effect once.

## User-facing / HTTP (5B2, not wired)

Recommend **409** `{ code: BILLING_RECOVERY or STALE_REQUEST, retryable: false }`
when `needs_recovery`. Do not use 502 retryable true (that invites provider
spam). Success contract 200 unchanged. Client hint: `BILLING_RECOVERY` /
retry later without a new image submit as a new operation unless a **new**
operation id is issued.

## Privacy

Durable rows: ids, feature, user uuid, status, UNAVAILABLE flags. No image,
prompt, nutrition, health, raw provider body, keys.

## Retention

Terminal reservation/usage rows follow existing BILL-1/2 retention. No new
cleanup job in this sprint. Index already: `event_id` PK,
`quota_reservations (user_id, feature, period_start, status)`.

## 50K

Point lookups by operation/reservation/event id. No unbounded operation
scans required.

## Findings

| Severity | Item |
| --- | --- |
| CRITICAL | None remaining in adapter contract |
| HIGH | Live route still unwired; 5B2 must inject usage-backed store or isolates will split-brain |
| MEDIUM | False-dispatch window (mark vs wire) stays UNKNOWN, not MEASURED |
| MEDIUM | Conservative commit-1 can consume quota when OpenAI never ran |
| LOW | Optional `dispatch_marked_at` on reservations (not required) |

## BILL-5B2 recommendation

**DO NOT APPROVE** until Hassan accepts: usage-backed dispatch CAS on the
canary, 409 non-retryable recovery, and conservative UNAVAILABLE cost on
ambiguous dispatch.

STARTA INTE BILL-5B2 in this sprint.
