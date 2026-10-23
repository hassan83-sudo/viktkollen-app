# Extra scan purchases — sandbox implementation

Production sales remain disabled. No database migrations have been applied remotely.
Continues draft PR #24 on its existing foundation. Main and Production are unchanged.

## Implemented

- Authenticated free and paying accounts can select food, body, or AI-Eye scans in Abonnemang & användning. Purchases never change subscription/assignment records. Guests must sign in.
- Server-only SEK unit prices in integer minor units; amount, user and merchant supplied by clients are ignored. Every durable intent snapshots user, feature, quantity, amount and merchant. Request UUIDs are idempotent per user; conflicting reuse is rejected. Eight new intents per ten minutes per user.
- SumUp hosted one-time checkout with an expiring unique reference, status callback and recovery by reference after a failed creation response. No recurring mandate or saved card is requested.
- Server retrieval verifies checkout ID, intent reference, amount, SEK currency, merchant, PAID status and exactly one matching successful transaction before the service-only grant RPC is called. Browser redirect/success is never payment authority.
- One grant per unique provider checkout ID. The database sets the first verification timestamp and expiry exactly 720 hours later; retries retain both dates.
- Existing reserve/commit/rollback RPCs use a shared per-user/feature lock across periods. Reservation IDs also have their own transaction lock. Monthly quota is allocated first, then nonexpired batches in expiry order, including splits across batches. Purchased allocations do not inflate monthly usage.
- Pending reservations hold purchased units, commit consumes only actual usage, rollback releases units without extending batch expiry. Scan reservations expire after 15 minutes or the allocated batch's expiry, whichever comes first. Late commits are rejected.
- Provider-reported refunds/reversals revoke the entire batch and roll back its pending reservations. Previously committed consumption stays recorded. A retry cannot reactivate a reversed batch.
- Read-only purchased balance shows each batch separately, remaining units and exact expiry. Before checkout, the UI explains the 720-hour lifetime from server confirmation; the actual expiry instant is available after confirmation.
- Tables have RLS, no client write rights and no client EXECUTE privilege on the purchase RPC. Server credentials are never sent to the browser.

## Configuration and endpoints

Customer endpoint: `GET /api/billing/extra-scans` (catalog/batches), authenticated `POST` with `action=create` or `action=verify`.
Callback: `POST /api/billing/extra-scans-webhook`, SumUp's `CHECKOUT_STATUS_CHANGED` payload. Notification is only a trigger for server retrieval.
No additional Vercel server function was introduced; routes reuse billing/user.

The sandbox gate requires all of:

- `EXTRA_SCAN_SANDBOX_ENABLED=true`
- `SUPABASE_URL=https://armtslzspuebmlysnooq.supabase.co` (or matching VITE fallback)
- Existing `SUMUP_API_KEY`, `SUMUP_MERCHANT_CODE` and Staging service-role key
- `EXTRA_SCAN_SANDBOX_MERCHANT_CODE` matching the independently confirmed sandbox merchant
- `EXTRA_SCAN_FOOD_MINOR`, `EXTRA_SCAN_BODY_MINOR`, `EXTRA_SCAN_EYE_MINOR`: positive integer unit prices between 100 and 10000 minor SEK, including VAT. No default/final commercial prices have been chosen.
- `EXTRA_SCAN_SANDBOX_CALLBACK_URL=https://<preview>.vercel.app/api/billing/extra-scans-webhook`
- `VERCEL_ENV` must not be `production`.

A Preview label alone is insufficient: the database project is allowlisted. This is a sandbox rollout gate, not independent proof that a SumUp merchant is a test merchant. Confirm that account before enabling. Missing configuration returns 503 and hides the purchase panel.

## Verification and remaining release blockers

Automated tests run real PL/pgSQL in local PGlite and simulate SumUp responses. They cover free and paid plans, all scan types, immutable subscription choice, client-price tampering, ownership, duplicate intent/grant, verification mismatch, 720-hour expiry, allocation across batches, monthly priority, expired batch rollback, reservation expiry, period change, refund reversal, RPC privileges and the customer UI.

`node scripts/verify-extra-scan-concurrency.mjs` is an additional three-connection PostgreSQL test. It requires `EXTRA_SCAN_TEST_DATABASE_URL` pointing to an isolated local database whose name starts with `extra_scan_test`. This test was NOT executed successfully: the container prohibits switching to an unprivileged OS user to start PostgreSQL. PGlite concurrent promises serialize internally and are not proof of multi-session locking.

Still missing / not verified:

1. Apply the preparation migration and new migration to isolated Staging after checking its current deployed RPC definitions. No remote schema has been changed in this work.
2. Configure an isolated Preview with sandbox merchant credentials and sandbox prices. PR #24 has no branch-specific environment variables. The existing SumUp API key is a non-readable Secret scoped to another Preview branch, so it cannot be extracted or copied through the available environment read API.
3. Real SumUp sandbox checkout/payment/callback, actual SumUp minimum charge, free-account and paying-account purchase followed by a real scan, and reloaded balance have not been verified. Callback must be reachable through Preview deployment protection.
4. Execute the multi-session concurrency script against isolated PostgreSQL. Do not describe PGlite's serialized test as that verification.
5. Refund/reversal processing is implemented when provider state is retrieved; independent periodic reconciliation and reliable chargeback notification delivery are not implemented/verified. No automated cash refund is initiated by this feature.
6. Final commercial prices and production activation require a separate decision. Production is hard-disabled by this implementation.
7. PR #24 is based on an older main and GitHub reports it is not mergeable. Integration with current main has not been performed; resolve that separately without overwriting parallel work.

Do not merge or enable production sales until the outstanding sandbox and locking verification is complete.
