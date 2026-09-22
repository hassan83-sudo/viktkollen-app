# BILL-5B1c — usage-backed dispatch CAS integration hardening

Status: **READY** (adapter/injection boundary only). Live `food.scan` route is **not** wired.

BASE: `cd5ee28fbe4e3f3a9cb252494b462b7e7f563fb4`

No OpenAI calls. No staging/production writes. **No migration.** **No new API route.**

This sprint is **not** BILL-5B2.

## 1. Durable source of truth

| Step | Primitive | Durable? |
| --- | --- | --- |
| `operation_id` | Server `createScopedOperationId` / `createBillingAccountingIdentity` | Identity only |
| Reservation | BILL-2 `billing.quota_reservations` PK `reservation_id` | Yes |
| Dispatch CAS | BILL-1 `billing.usage_events` PK `event_id` unique insert | Yes |
| Quota commit | BILL-2 reservation `PENDING → COMMITTED` | Yes |
| Usage event | Same `usage_events` row (`event_id === operation_id === reservation_id`) | Yes |
| Recovery/read | `usageRepository.getByEventId` + reservation inspect | Yes |
| Process `Map` | `createDurableOperationStore()` | **No** — tests/dev only |
| Inflight Promise map | keyed by `instanceKey:operationId` | Process-local coalesce only |

Conflict: duplicate `event_id` insert → `duplicate: true` → `ALREADY_DISPATCHED`.

Retry: recover from the usage row + reservation; do not send another provider call.

Transaction boundary: none required. CAS is the unique insert. Quota commit is a separate BILL-2 update. That split is why crash-C is a documented false-dispatch window, not exactly-once delivery.

## 2. Dispatch CAS implementation

`createUsageBackedDispatchStore` / `createFoodScanDurableDispatchStore`:

`markDispatched` / `claimDispatch(operation_id)` calls existing `recordUsage` with `foodScanUsageEventPlan`.

Outcomes:

- `FIRST_DISPATCH` — unique insert won
- `ALREADY_DISPATCHED` — PK conflict / duplicate
- `PERSISTENCE_FAILURE` — `ok: false` or thrown I/O

`cost_basis` and `usage_basis` stay `UNAVAILABLE`. Never `MEASURED`.

## 3. Production dependency injection contract

BILL-5B2 **must** call:

1. `createFoodScanDurableDispatchStore({ recordUsage, usageRepository })`
2. `executeDurableMeteredBillingOperation({ operationStore, requireDurableDispatch: true, ... })`

Constants: `BILL_5B2_DISPATCH_INJECTION` in `foodScanCanary.js`.

`executeDurableMeteredBillingOperation` sets `requireDurableDispatch: true`.

A process `Map` is allowed only when `requireDurableDispatch` is false **and** the Map is explicitly injected or the unit-test default path is used.

## 4. Cross-instance behavior

Two store instances that share **only** the usage repository (no shared JavaScript `Map`, no global lock) racing `claimDispatch(SAME_OPERATION_ID)` produce one `FIRST_DISPATCH` winner. The other sees `ALREADY_DISPATCHED`. Provider eligibility is at most once.

## 5. Persistence-failure behavior

If durable dispatch is required but the store is missing, is a Map, or CAS returns `PERSISTENCE_FAILURE`:

- fail closed **after reserve, before provider**
- rollback the reservation when possible
- `LIFECYCLE_OUTCOME.PERSISTENCE_FAILURE`
- `PROVIDER_DISPATCH_STATE.NOT_DISPATCHED`
- provider calls: **0**
- no invented measured cost

Silent Map fallback is forbidden on that path.

## 6. Crash / recovery matrix

| Case | Result |
| --- | --- |
| A crash before reserve | Other isolate may reserve and dispatch |
| B crash after reserve, before CAS | Reservation still PENDING; later isolate may CAS + provider |
| C CAS succeeds, crash before provider send | Recoverer treats as dispatched; **does not** re-call provider |
| D provider request sent, response lost | `DISPATCHED_BILLING_UNKNOWN`; cost `UNAVAILABLE` |
| E provider success, crash before quota commit | Recoverer commits quota; no second provider call |
| F quota commit, crash before extra usage write | Usage row already exists from CAS; recoverer completes |
| G two recoverers race | Idempotent commit/usage; provider 0 |
| H client retry after ambiguous | Provider blocked; no second dispatch |

## 7. False-dispatch window

**DOCUMENTED, not resolved.** Unique `event_id` insert is the dispatch claim. The provider HTTP send is a later step. If the process dies between CAS and send, recovery will **not** send again, but the provider may never have been reached. This is **not** exactly-once provider delivery.

## 8. Ambiguous billing semantics

Ambiguous post-dispatch failure remains `DISPATCHED_BILLING_UNKNOWN` / `AMBIGUOUS_BILLING`. Blind rollback stays blocked. Retry after ambiguous does not unlock a new provider send on the same `operation_id`.

## 9. Quota vs provider cost

- Quota: conservative commit-1 when already dispatched (MEDIUM fairness limitation unchanged).
- Provider cost: `UNAVAILABLE` / unknown. Never converted to `MEASURED` or an invoice amount.

These remain separate concepts.

## 10. Remaining blockers

HIGH (this sprint): closed — 5B2 can inject usage-backed CAS; Map cannot be production authority on the durable entry.

MEDIUM (unchanged, not solved):

1. False-dispatch window (CAS vs actual HTTP send)
2. Conservative commit-1 quota fairness

Historical: TIMESTAMP / COST / 50K remain **PARTIAL**.

## 11. BILL-5B2 approvability

**DO NOT APPROVE BILL-5B2 yet** as a completed live wire. The **injection boundary is READY**. Wiring `api/nutrition-photo-analysis` still requires a dedicated 5B2 review (live provider, route import, function budget 11/12, operational runbook). This sprint does not execute that wire.

Client spoof of dispatch/quota/identity remains ignored; canonical server identity is authoritative. Image dedup is not billing idempotency.

Privacy: durable rows persist metering identifiers and `UNAVAILABLE` cost flags only — no image bytes, base64, provider payloads, meal text, or secrets.
