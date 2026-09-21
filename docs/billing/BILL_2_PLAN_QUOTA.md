# BILL-2 — Plan engine & quota engine

Branch: `billing-cost-metering-sprint1`
Base: BILL-1E `e4dddf5`. `origin/main` remains `c8899a5`.

**Production was not mutated in BILL-2.** The live production schema is still BILL-1 `billing.usage_events` only.
`supabase/migrations/20260921180000_billing_plan_quota.sql` is local-only until a later staging/production review.

No Stripe / SumUp / Klarna / Apple IAP / Google Play / checkout / charge / refund / proration. BILL-3 was not started.

## Reused BILL-1 foundation

- Usage event types and **one** unit list: `requests`, `tokens`, `seconds`, `images`, `sessions`, `writes`, `reads`.
- Integer minor units (`price_minor`, SEK öre). No float money.
- Idempotency: usage `event_id`; quota `reservation_id`.
- Privacy allowlist: reservations store quota fields only.
- Server authority: plan assignment and remaining are not taken from the client.

## Plan engine

Plans are data (`src/services/billing/planCatalog.js`): `id`, `name`, `price_minor`, `currency`, `billing_interval`, `active`, `display_order`, `version`.

SEK/month majors `4…99` are **PRELIMINARY** and **ADMIN-CONFIGURABLE**. Example: 9 kr = `900` öre, id `plan.prelim.sek.month.09`. Display name can change later without rewriting the quota engine. `version` is the hook for future price/entitlement replacement (full subscription versioning is later).

## Entitlements

Canonical feature IDs match BILL-1 event types where metering applies (`food.scan`, `ai.text.request`, …). Aliases like `food_scan` resolve to the same id.

Live vs catalog-only is taken from this repo (e.g. nutrition-photo and AI-ear APIs exist; `gps.live.session` / `tts.request` are catalog-only until wired). Unmetered local features (`ready_avatar`, `gps_standard`, `friend_chat`) return `ALLOWED_UNMETERED` so BILL-2 does not block ordinary Viktkollen tools.

- `enabled: false` → `DENIED_DISABLED` (no reservation, no usage write).
- Limit is `{ kind: 'NUMBER', value }` or `{ kind: 'UNLIMITED' }`. Never `-1`, `999999999`, `Infinity`, or null-as-unlimited.

Default numeric limits are **PRELIMINARY**, not a product decision.

## Quota engine

`createQuotaEngine` (in-memory store now; SQL is the persistence foundation):

1. Server plan assignment (default `plan.free`).
2. Entitlement / unit / quantity checks.
3. Period usage = committed actuals + pending reservations (+ BILL-1 usage events not already tied to a `reservation_id`).
4. `reserveQuota` is mutexed per user+feature so two callers cannot both consume `remaining = 1`.
5. `commitReservation` is idempotent. If actual &lt; reserved, unused quantity is released.
6. `rollbackReservation` is idempotent. Double rollback does not add quota. Commit then rollback does not unwind a commit.
7. Periods are UTC `day` / `week` / `month` with exclusive end. Not “30 days”. Client clock is ignored.
8. Remaining is `max(0, limit - committed - reserved)`. Integrity overage is still visible.

### Actual &gt; reserved

**Policy: `COMMIT_ACTUAL_COUNT_OVERAGE`.** Count the actual integer against the period, set `overage_quantity`, keep `remaining >= 0`, deny future reserves when remaining is 0. Do not invent extra quota.

## Client manipulation

`inspectQuota` / `reserveQuota` ignore `clientClaim.plan_id`, remaining, unlimited, and client `now`. `readClientQuotaDisplay` copies the server snapshot only. GET `/api/billing/quota` uses verified user id, not a body plan id.

## What BILL-2 did not do

- Did not apply SQL to staging or production.
- Did not wire quota into every product route (would start blocking the app).
- Did not start BILL-3 admin persistence or payments.
- Did not merge to `main`.
