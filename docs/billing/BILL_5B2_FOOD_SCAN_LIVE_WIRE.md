# BILL-5B2 — food.scan durable billing canary wiring

Status: **READY in branch** (wired, not deployed).

BASE: `ad6d1c1212b77e83197dd7a5cacfab66c95a0604`

No real OpenAI. No staging/production mutations. **No migration. No new API route.**

This is **not** a production canary approval.

## 1. Final request lifecycle

`api/nutrition-photo-analysis/index.js`:

POST → CORS → `verifySupabaseUser` → multipart/image validation → consent token → OpenAI key present → `resolveFoodScanBillingRuntime` → server `operation_id` → `executeDurableMeteredBillingOperation` (`requireDurableDispatch: true`) → evaluate → reserve → usage `event_id` CAS → `markDispatched` → `runDedupedAiRequest` → `callOpenAi` / `callOpenAiJson` → commit → existing 200 `{ ok, analysis, requestId, source: 'remote' }` or safe error.

## 2. Operation identity

`createScopedOperationId({ userId: auth.user.id, clientAttemptId: x-viktkollen-request-id, featureId: 'food.scan', route })`.

Never uses the client string as `operation_id`. Invalid/missing attempt id → server UUID.

`operation_id === reservation_id === event_id`.

Image fingerprint is UX-only (`IMAGE_DEDUP_ROLE.billing_authority === false`).

## 3. Durable dispatch CAS

`createFoodScanDurableDispatchStore` + unique `billing.usage_events.event_id` insert.

Outcomes: `FIRST_DISPATCH` / `ALREADY_DISPATCHED` / `PERSISTENCE_FAILURE`.

Process `Map` is not production authority. Missing runtime → **503 before provider**.

## 4. Postgres usage adapter

`createPostgresUsageRepository`: service_role `billing.usage_events` insert + `getByEventId`. Unique violation `23505` → duplicate.

## 5. Postgres quota adapter

`createPostgresQuotaBackend` + `createSupabaseBillingRpcQuery`.

- reserve / commit / rollback: existing RPCs
- inspect: `billing.reserve_quota` **quantity 0** snapshot (no extra schema). Remaining may be omitted; reserve still enforces limits.

## 6. Feature / provider controls

`loadFoodScanOperationalControls` reads `feature_controls` / `provider_controls` when the admin client works. Load error → fail closed. Missing row keeps BILL-4B default ENABLED / AVAILABLE.

## 7. Provider callback boundary

There is one `callOpenAi` path, inside `executeProvider` after `markDispatched`. Tests assert the usage row exists before mocked `fetch`.

Not exactly-once across network loss.

## 8. Gateway usage-event dedup

`callOpenAiJson({ requestId: operation_id, userId, usageRepository })`. Later `recordOpenAiGatewayUsage` inserts the same `event_id` → duplicate no-op. Token counts are metadata only. `cost_basis` stays `UNAVAILABLE`. CAS row `usage_basis` stays `UNAVAILABLE` (append-only).

## 9. Response mappings

| Outcome | HTTP |
| --- | --- |
| Success with analysis | 200 existing body |
| Auth | 401 |
| Consent | 403 `CONSENT_REQUIRED` |
| Feature/provider/entitlement/cost | 403 `SAFETY_BLOCKED` |
| Quota | 429 `RATE_LIMITED` |
| Persistence missing | 503 |
| Already dispatched / recovery, no replayable analysis | 409 `STALE_REQUEST` |
| Timeout after dispatch | 504 |
| Other provider failure | 502 |

Never 200 `ok: true` without `analysis`. No billing internals in the client body.

## 10. Retry / recovery

Retry before CAS may proceed. Same `operation_id` after CAS does not re-fetch. Ambiguous → `DISPATCHED_BILLING_UNKNOWN`. Blind rollback blocked. Analysis JSON is not stored for replay.

## 11. False-dispatch window

**ACCEPTABLE DOCUMENTED LIMITATION.** CAS can win, then the isolate can die before OpenAI `fetch`. Retry is blocked; quota may commit 1; cost `UNAVAILABLE`.

## 12. Conservative quota

**ACCEPTABLE FOR CANARY.** Ambiguous post-dispatch may consume one `food.scan` request.

## 13. Provider-cost semantics

Quota accounting ≠ provider invoice. No `MEASURED` invoice amount. Token metadata ≠ invoice.

## 14. Privacy

Usage rows: identifiers + allowlisted numeric/token metadata + `UNAVAILABLE` flags. No image, base64, meal text, consent, provider JSON, API keys.

## 15. Observability

Logs: `operationId`, feature, model name, dispatch/evaluate events, truncated fetch diagnostics. No image, tokens, meal text, secrets.

## 16. Test evidence

Mocked `fetch` only. Matrix covers auth, consent, feature/provider/entitlement/quota/cost denies, store down, first dispatch, retry, concurrent CAS, invalid JSON, 5xx ambiguous, false-dispatch, gateway duplicate, spoof headers, fingerprint ≠ billing id.

## 17. Remaining limitations

False-dispatch window; commit-1 fairness; image dedup ≠ billing idempotency; inspect quantity-0 may omit remaining (reserve still authoritative); PostgREST must expose `billing` schema to service_role at deploy time (config, not a SQL migration). Historical TIMESTAMP / COST / 50K remain **PARTIAL**.

**PRODUCTION CANARY: do not deploy until a dedicated review.**
