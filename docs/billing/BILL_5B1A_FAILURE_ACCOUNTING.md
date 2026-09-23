# BILL-5B1a — food.scan failure accounting and billing idempotency

Status: **READY** (adapter + tests). Live route is **not** wired.

BASE: `fb1ca8ce68879ac03f34a276e37aa927ffee12fb`

No OpenAI calls. No staging/production DB writes. No migration (BILL-1
`event_id` text and BILL-2 `reservation_id` text already allow a shared id).

## Provider dispatch boundary

The provider hook receives `{ markDispatched }`. **5B2 must call
`markDispatched()` immediately before `fetch` / SDK send**, using
`createDispatchBoundedProvider(run)` or the same one-liner.

Until that hook runs, the operation is `NOT_DISPATCHED`.

HTTP 5xx, timeout, reset, or abort **after** the marker is never mapped to
“OpenAI did not bill”. That invoice cannot be observed from this app.

## Dispatch states

| State | Meaning | Accounting |
| --- | --- | --- |
| `NOT_DISPATCHED` | Proven: provider send did not start | rollback |
| `DISPATCHED_CONFIRMED_SUCCESS` | Provider `ok: true` | commit 1 + one usage event |
| `DISPATCHED_CONFIRMED_FAILURE_NOT_BILLABLE` | Exists in the enum; **OpenAI 502/504 never use it** | rollback only if a later sprint can prove non-start |
| `DISPATCHED_BILLING_UNKNOWN` | Send started or cannot be proven otherwise | commit 1, no blind rollback, no second provider call |

BILL-5B1 names `NOT_STARTED` / `COMPLETED` / `UNKNOWN_MAY_BE_BILLED` are
aliases of these values.

## Conservative accounting

Canonical food.scan quantity remains **1 `requests`**. Ambiguous
post-dispatch failure commits that 1. We do not invent token quantities.

This prefers not giving away a paid OpenAI hop. It can over-count quota if
OpenAI did not bill. That is explicit and accepted until a provider-side
proof exists (it does not today). **HIGH blocker: FIXED as policy**, not as
an OpenAI invoice oracle.

## Rollback policy

Rollback only when `NOT_DISPATCHED` (or the unused proven-not-billable
state). Timeout/abort/502 after dispatch: **no rollback**.

## BILL-2 recovery

No new reservation states. PENDING + `expires_at` (BILL-2) still covers a
crash before commit. Adapter ledger (in-process) plus idempotent
`commitReservation` / usage `event_id` is the recovery path:

- commit failed after dispatch → `needs_recovery`, retry **commit + usage
  only**
- usage failed after commit → retry **usage only**, same `event_id`
- already committed → `ALREADY_COMPLETED`, provider 0

A crash that loses the in-process ledger can still recover from BILL-2:
same `reservation_id` reserve returns `COMMITTED` or `PENDING`. 5B2 must
pass the stable operation id on retry. **No schema change required.**

## Operation identity

One canonical server id:

```
operation_id === reservation_id === event_id
```

`createBillingAccountingIdentity(operationId)` enforces that. BILL-1
`event_id` is a string ≤ 180 characters (not UUID-only). `op_<32 hex>` and
UUIDs both fit.

BILL-2 `periodUsage` already ignores usage rows whose `event_id` is a known
`reservation_id`, so the pair does not double remaining.

Image bytes / image hash are **not** part of the id.

### Client request id

`normalizeClientAttemptId`: `[A-Za-z0-9._-]{8,80}` only, then hashed with
verified `userId` + `food.scan` + route. Invalid/missing → server UUID.
Retry then **cannot** correlate unless the client resends a valid scoped id
or the server echoes `operation_id` (5B2 should return it on errors).

## Image dedup vs billing

`runDedupedAiRequest` / image fingerprint = in-flight UX.
`IMAGE_DEDUP_ROLE.billing_authority = false`.
Billing authority is only the operation id.

5B2 may still coalesce HTTP after reserve, but the key must include
`reservation_id`, not the image hash alone.

## Retry policies

| Prior result | Same operation id |
| --- | --- |
| Success | no provider, no new reserve, no second usage insert (duplicate `event_id`) |
| Ambiguous / commit-failed / usage-failed | **provider blocked**; recover commit/usage |
| Rollback because never dispatched | `RETRY_REQUIRES_NEW_OPERATION` — new id required (same id must not hide a new paid hop behind a rolled-back row) |

## Concurrency

In-process `inflight` map: same `operationId` shares one Promise. Provider
runs once. This is not distributed exactly-once. It is **idempotent
effects + stable identity + safe recovery**.

## Commit then usage

Documented order after a billable (or unknown) provider result:

1. `commitReservation` actual 1
2. BILL-1 usage event with the same id

Windows:

- commit fails, no usage: quota still PENDING (holds remaining); cost not
  recorded; retry commit; **do not rollback**
- commit ok, usage fails: quota counted; cost missing; retry usage only
- usage-first would record cost while quota could still roll back — rejected

## Privacy

Safe fields: feature, provider, operation/reservation/event id, reason
codes, dispatch state. No image, prompt, nutrition JSON, health, API keys,
`service_role`, DB URLs. Provider errors are reduced to `{ code }`.

## Live route

`api/nutrition-photo-analysis/index.js` still does not import the adapter.

## Vercel

11 functions. No new route.

## Historical limitations (unchanged)

HISTORICAL TIMESTAMP: PARTIAL  
HISTORICAL COST: PARTIAL  
50K FOUNDATION: PARTIAL

## Blockers after 5B1a

| 5B1 item | After 5B1a |
| --- | --- |
| HIGH OpenAI ambiguous billing | **FIXED as conservative policy** (commit 1, no blind rollback, no re-dispatch). Invoice still unknown. |
| MEDIUM reservation ↔ usage id | **FIXED** (same string) |
| MEDIUM image dedup as billing id | **FIXED** (explicitly not authority) |

Open for 5B2 (not 5B1a blockers): wire after consent; call `markDispatched`
immediately before fetch; persist/return `operation_id` to clients for
retry; keep image deduper non-authoritative.

## BILL-5B2 recommendation

**DO NOT APPROVE** live wiring until Hassan accepts:

1. Ambiguous OpenAI failures consume 1 food.scan request.
2. 5B2 will mark dispatch immediately before the network send.
3. Clients can retry with the server `operation_id`.

STARTA INTE BILL-5B2 in this sprint.
