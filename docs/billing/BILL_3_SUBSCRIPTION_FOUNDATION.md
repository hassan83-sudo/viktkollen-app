# BILL-3 — Subscription state & plan assignment foundation

Branch: `billing-cost-metering-sprint1`
Base BILL-2C: `3d88ed347b3e4a7844d3af1c8dcce76f97ac30c4`

**This migration is local-only.** Do not apply `supabase/migrations/20260921200000_billing_subscriptions.sql` to staging or production. BILL-3 does not wire the production app user flow, paywall, checkout, or prices.

Payment processors are out of scope. No SDK, no secrets, no card data, no refund, no proration.

## Subscription model

Table `billing.subscriptions` (and the in-memory trusted store used by tests):

| Field | Role |
| --- | --- |
| `subscription_id` | Immutable identity |
| `user_id` | Auth user (server-derived) |
| `plan_id` + `plan_version` | Snapshot of BILL-2 plan at create |
| `status` | Machine status (not UI copy) |
| `current_period_start` / `current_period_end` | Exclusive-end server period (`end > start`) |
| `cancel_at_period_end` | Keep access until `period_end` while status remains entitled |
| `pending_plan_id` / `pending_plan_change` | Foundation for later now / next_period change (no money logic) |
| `past_due_grace_until` | Optional; unset means PAST_DUE is not entitled |
| `provider*` / `external_event_id` | Optional future processor refs; empty now |

Timestamps `created_at` / `updated_at` are database `now()`. Client clocks are ignored.

## Statuses

Stable IDs only. Never `"Aktiv"` / `"Avslutad"` / `"Obetald"` in logic.

| Status | Semantics | Entitled? |
| --- | --- | --- |
| `TRIALING` | Trial period on a plan. Model only; BILL-3 does not seed production trials. | Yes, while `now` is in `[start, end)` |
| `ACTIVE` | Paid/open subscription (no payment collected here). | Yes, while in period |
| `PAST_DUE` | Collection failed in a future processor. Grace is **not** guessed. | Only if `past_due_grace_until` is set and `now < grace` **and** still in period |
| `PAUSED` | Open but not entitled. Can return to `ACTIVE` or go `CANCELED`. | No |
| `CANCELED` | Immediate cancel. Terminal. Not entitled even if period dates remain. | No |
| `EXPIRED` | Period ended (including after cancel-at-period-end). Terminal. | No |

`cancel_at_period_end = true` does **not** change status by itself. Resolver keeps the current plan until `period_end`, then fail-safes to baseline even if a job has not yet written `EXPIRED`.

## State machine

Allowed transitions (same status is a no-op for idempotency):

- `TRIALING` → `ACTIVE` | `CANCELED` | `EXPIRED` | `PAUSED`
- `ACTIVE` → `CANCELED` | `EXPIRED` | `PAST_DUE` | `PAUSED`
- `PAST_DUE` → `ACTIVE` | `CANCELED` | `EXPIRED`
- `PAUSED` → `ACTIVE` | `CANCELED`
- `CANCELED` → none
- `EXPIRED` → none

Immediate cancel is `→ CANCELED` (no refund, no proration). Cancel-at-period-end is a flag on `TRIALING`/`ACTIVE`.

Enforced in `src/services/billing/subscriptionState.js` and `billing.guard_subscription_row()`.

## Terminal states

`CANCELED` and `EXPIRED` are terminal. The database and service reject reactivation (`CANCELED → ACTIVE`, `EXPIRED → TRIALING`, etc.).

## Effective plan resolver

`resolveEffectivePlan` / `createSubscriptionService().resolveForUser`:

1. Ignore client claims (`plan_id`, status, period, unlimited, client `now`).
2. Filter subscriptions that are entitled for **server** `now`.
3. If none → BILL-2 baseline `plan.free` (`NO_SUBSCRIPTION`). Never premium by default.
4. If several (should not happen for open rows) → later `current_period_end`, then lexicographically smaller `subscription_id`. Never “highest paid plan”.
5. Unknown `plan_id` → baseline (`UNKNOWN_PLAN`). No unlimited.
6. Historical row whose plan is later marked inactive: still use that snapshot while entitled. **New** creates require `plans.active = true`.

Quota engines should use `createSubscriptionAssignmentStore(service)` so they never ask the frontend for `plan_id`. Production GET `/api/billing/quota` is **unchanged** in BILL-3 (still default assignment / `plan.free`) so live users are not gated.

When assignment includes subscription period bounds, quota inspect/reserve uses those instead of calendar `periodBounds`.

## No-subscription / unknown / inactive

- No row → `plan.free`.
- Unknown plan on an entitled row → `plan.free`.
- New subscription to inactive plan → blocked (`inactive_plan` / SQL `new subscription requires an active plan`).
- Existing inactive plan reference → keep snapshot until the period is no longer entitled.

## Plan version

`plan_version` is copied from the catalog at create and is immutable. Admin edits to a live catalog row later must not rewrite historical subscription snapshots (full admin versioning is later).

## One active subscription

At most one **open** row per user: `TRIALING`, `ACTIVE`, `PAST_DUE`, `PAUSED`. Unique index `subscriptions_one_open_per_user_uidx`. Terminal history rows may coexist.

## Provider-agnostic design

Optional `provider`, `provider_customer_ref`, `provider_subscription_ref` default to empty. No live processor IDs. Client-safe JSON omits these fields. Unique `external_event_id` is the idempotency key for a future webhook: replay returns the existing row and does not extend the period or change plan.

## Idempotency

- Same `external_event_id` on create → original row.
- Same `external_event_id` on transition → original row (will not reactivate a terminal status).
- Identical `from → from` status is allowed.

## Database / RLS / grants

- RLS + FORCE RLS, restrictive deny-all to `public`.
- `anon` / `authenticated` / `PUBLIC`: no SELECT/INSERT/UPDATE/DELETE grants.
- `service_role`: SELECT/INSERT/UPDATE; DELETE revoked.
- Guard trigger: open statuses on insert, active plan on insert, identity + plan snapshot immutable, event id immutable once set, transition map, `updated_at = now()`.

BILL-1 `usage_events` and BILL-2 reservation/assignment tables are not altered. Cancel/expire does not delete usage or reservations.

## Privacy

No PAN, CVV, bank data, prompts, AI responses, audio, images, GPS, passwords, or API secrets. Subscription state is not payment-credential storage.

## API

`GET /api/billing/subscription` — JWT user only. Query `user_id` for another user → 403. POST/PATCH → 405. Response: `status`, `plan_id`, period, `cancel_at_period_end`. No frontend admin UI.

Trusted mutations exist only as `createSubscriptionService` (server/tests). They are not exposed as client routes in BILL-3.

## Tests

Focused: `subscriptionFoundation.test.js`, `billingSubscription.security.test.js`. Regression: BILL-2 `quotaEngine.test.js` / `billingPlanQuota.security.test.js`; BILL-1 `billing.test.js` / `billingMigration.security.test.js`.

## Remaining risks / staging

- SQL is unapplied. Multi-instance authority for subscriptions is the future DB trigger/index, same pattern as BILL-2 quota RPCs.
- Production quota API still uses default `plan.free` assignment until a later sprint explicitly switches it.
- PAST_DUE grace is unset by default; a later sprint must configure it when a processor exists.
- Pending plan change columns are unused (no money, no apply-now).
- In-memory store uniqueness is process-local.

Staging requirements (later BILL-3A+): apply SQL only after the same isolated preflight as BILL-1E/2B; never use production env; no public REST policies.

## What BILL-3 did not do

No paywall, no price finalization (4–99 kr catalog remains PRELIMINARY / ADMIN-CONFIGURABLE), no BILL-4, no `main` merge, no Vercel deploy, no production/staging migration apply.
