# BILL-5B1 — food.scan canary security and lifecycle design

Status: **READY** (design + isolated adapter). Live route is **not** wired.

BASE: `f299dc9dd5d122fd2c15f5af91a0c3ff257fbcfb`

BILL-5B2 is **not** started. Staging/production were not mutated.

## Route

`api/nutrition-photo-analysis/index.js`

Read in full. Behavior below is from that file plus
`api/_shared/openaiGateway.js` and `api/_shared/billing/recordOpenAiGatewayUsage.js`.

## Canonical feature

**food.scan** — confirmed, not guessed.

The handler calls `callOpenAiJson({ feature: 'food.scan', type: 'photo', ... })`.
BILL-5A inventory maps this path to `food.scan`. Registry unit is `requests`.
Gateway usage recording uses `quantity: 1` and `unit: 'requests'` for this
feature (token counts are metadata only).

Mapping is **safe**. Sprint continues.

## Provider

- Canonical provider id: `openai`
- Path: `api/_shared/openaiGateway.js` → `callOpenAiJson`
- Upstream: `POST https://api.openai.com/v1/responses`
- Auth to OpenAI: `Authorization: Bearer ${OPENAI_API_KEY}` (server env only)
- Model default: `gpt-4.1-mini` (`NUTRITION_PHOTO_MODEL` / `OPENAI_MODEL`)
- Timeout: `NUTRITION_PHOTO_ANALYSIS_TIMEOUT_MS` = 45000 (override
  `NUTRITION_PHOTO_TIMEOUT_MS`)
- `store: false` on photo requests

Provider was not changed.

## Auth and request gates (current route)

Order today:

1. `Cache-Control: no-store`
2. Server `requestId` = `photo-${time}-${random}` (not client-controlled)
3. POST only → 405
4. CORS: `Origin` hostname must match `VERCEL_URL` when both are present;
   missing origin or missing `VERCEL_URL` currently allows the request
5. `verifySupabaseUser` — unauthenticated JSON `{ ok: false, error }` with
   auth status (typically 401)
6. `Content-Type` must be `multipart/form-data` → 415
7. In-memory rate limit (`nutritionPhoto`, per user) → 429 + `Retry-After`
8. Parse multipart; validate JPEG/PNG/WebP magic + size (400/413/415)
9. Consent header `x-viktkollen-consent-token` (never a form field) → 403
10. `runDedupedAiRequest` (in-flight 30s, user+route+image fingerprint)
11. `callOpenAi` / OpenAI
12. Validate JSON payload; 200 `{ ok, analysis, requestId, source: 'remote' }`

Client may send `x-viktkollen-request-id` (`clientAttemptId`). It is **logged
only**. It is not billing authority.

## Current success contract (preserve in 5B2)

HTTP 200:

```
{
  ok: true,
  requestId: string,
  source: 'remote',
  analysis: { ...nutrition estimates, components, warnings, ... }
}
```

5B2 may add **optional** safe billing fields later; must not remove or reshape
`analysis` / `ok` / `source` / `requestId`.

## Current errors

| Status | When |
| --- | --- |
| 405 | Not POST |
| 403 | CORS blocked; consent missing/invalid |
| 401 (and other auth.status) | `verifySupabaseUser` failure |
| 415 | Not multipart, bad image type/signature |
| 400 | Missing/empty image |
| 413 | Oversized body/image |
| 429 | Route rate limit or upstream 429 mapped |
| 499 | Client abort (`REQUEST_ABORTED`) |
| 502 | Provider unavailable / invalid JSON after OpenAI |
| 503 | OpenAI not configured |
| 504 | Timeout |

Safe body: `{ ok: false, error: { code, requestId, retryable, safeMessage } }`.
No stack, no API key, no image.

Minimal 5B2 billing additions (recommendation only): map evaluate/reserve
denies onto existing 403/429/401 codes; do not invent a new Vercel function.

## Current metering

- Route does not write quota.
- `callOpenAiJson` records a BILL-1 usage event **only after successful JSON
  parse**, fail-open (`recordOpenAiGatewayUsage`). `event_id` = gateway
  `requestId`. `quantity` = 1 request. Tokens in allowlisted metadata.
- Timeout/abort/HTTP error: **no** usage event today.
- Deduper is in-flight coalescing, not durable idempotency.

## Authority

5B2 must pass **verified** `auth.user.id` into `evaluateBillingOperation` and
quota reserve. Client `plan_id`, `remaining`, `costSafe`, `feature`,
`quantity` are ignored. Server feature is always `food.scan`. Server quantity
is always `1`.

## Lifecycle order (adapter)

`executeMeteredBillingOperation` in
`src/services/billing/meteredOperationLifecycle.js`:

1. **evaluate** (`evaluateBillingOperation`) — deny ⇒ stop
2. **reserve** (BILL-2) — deny ⇒ stop, no provider
3. **provider** (mock in 5B1)
4. **commit** actual quantity `1` `requests` on success, or on
   `UNKNOWN_MAY_BE_BILLED` failure
5. **rollback** only when provider work **did not start**

Live handler still does **not** import this adapter.

## Quantity / unit

| Field | Value | Source |
| --- | --- | --- |
| quantity | 1 | One photo analysis request; BILL-1 gateway already commits 1 |
| unit | `requests` | `BILLING_FEATURES['food.scan'].unit` |
| tokens | metadata only | Not quota quantity |

## Provider success

reserve → mock/live provider `ok` → `commitReservation({ actual_quantity: 1 })`.
Idempotent via BILL-2 `reservation_id` = scoped operation id.

Optional later usage event **must** use `event_id` = that same
`reservation_id` so quota `periodUsage` skips it (BILL-2 already skips usage
rows whose `event_id` is a known reservation id). Quota remaining is
reservation authority. Cost aggregation remains usage-event authority
(tokens/catalog). Do not count the same request twice against remaining.

## Provider failure

Observed app outcomes ≠ OpenAI invoice.

| Class | When | Lifecycle |
| --- | --- | --- |
| `NOT_STARTED` | missing key / abort before fetch (`providerRequestStarted === false`) | **rollback** |
| `UNKNOWN_MAY_BE_BILLED` | timeout/5xx/invalid JSON/parse after the request may have left the process, or flag omitted | **commit 1** (`COMMIT_ACTUAL_COUNT_OVERAGE` policy). Do **not** blind-rollback |
| `COMPLETED` | `ok: true` | commit 1 |

OpenAI may bill completions that this app treats as 502/504. That cannot be
proven from current gateway fields. **HIGH blocker for 5B2:** Hassan must
accept “commit 1 on ambiguous failure” or require a stronger
`providerRequestStarted` signal from the gateway before live wiring.

## Timeout / abort

- Reservation `expires_at` = now + 45000ms + 5s (BILL-2 expiry; PENDING
  expired rows do not consume remaining).
- Timeout after start: commit 1, outcome `TIMED_OUT` (reservation not left
  PENDING).
- Abort before start: rollback, outcome `ABORTED`.
- Abort after start: same as unknown billing → commit 1.

## Idempotency

- Server operation id: `createScopedOperationId({ userId, featureId, route, clientAttemptId })`.
  Client id is hashed with user+feature+route; it is never sole authority.
  Missing client id → random UUID.
- Retry same id after **COMMITTED**: reserve returns committed; adapter skips
  provider (no double charge).
- Double commit / double rollback: BILL-2 idempotent.
- Commit after rollback / rollback after commit: **blocked** by BILL-2.
- In-flight Map coalesces identical `operationId` during one process.
- Existing 30s image deduper is **not** a billing key. 5B2 should keep it
  **after** reserve, keyed with the reservation, so two HTTP retries do not
  start two OpenAI calls against one PENDING row.

## Commit failure recovery

If provider succeeded (or may have been billed) and commit fails: **fail
safe**, `needs_recovery: true`, **do not rollback**. Recovery: retry
`commitReservation` with the same `reservation_id`. Blind rollback would
create unmetered OpenAI usage.

## Privacy / logging

Adapter output and usage plan use BILL-1 allowlist only (`image_count`,
`usage_basis`, token counts when present). No meal image, prompt, provider
JSON, GPS, health text, API keys, `service_role`, DB URLs.

## Safe billing errors (5B2 mapping, not wired)

Return existing `sendSafeAiError` shapes. Do not leak quota remaining,
threshold ids, SQL, or stacks. Soft cost warnings may be omitted from the
client body in 5B2 or added as a non-sensitive `warnings` array of codes
only.

## Historical limitations (unchanged)

HISTORICAL TIMESTAMP: PARTIAL  
HISTORICAL COST: PARTIAL  
50K FOUNDATION: PARTIAL

## Security findings

| Severity | Finding |
| --- | --- |
| CRITICAL | None in 5B1 scope |
| HIGH | OpenAI billable-on-app-failure cannot be proven; adapter commits 1 instead of rolling back when the request may have started |
| MEDIUM | 5B2 must stop fail-open usage events that do not share `reservation_id`, or remaining will double-count |
| MEDIUM | In-flight image deduper ≠ billing idempotency; must compose with reservation id |
| LOW | CORS allows missing Origin / missing `VERCEL_URL` (pre-existing) |
| LOW | `clientAttemptId` is logged; keep it non-authoritative |

## 5B2 recommendation

**DO NOT APPROVE** live wiring until Hassan decides the HIGH OpenAI
failure-billing policy and the usage-event/`reservation_id` join.

Suggested first wire (later): after consent, before `runDedupedAiRequest`,
call `executeMeteredBillingOperation` with mock replaced by existing
`callOpenAi`, in-memory quota **not** used in production — production would
use BILL-2 Postgres RPCs (already exist, not applied as a new 5B1
migration).

## Test results

Focused adapter + mapping tests in
`src/services/billing/meteredOperationLifecycle.test.js`.
No real OpenAI. No staging/production DB.

## Vercel

Still 11 functions. No new route.
