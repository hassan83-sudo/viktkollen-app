# SumUp recurring: launch gates

Status: NOT READY FOR PRODUCTION. This document does not authorize a deployment, migration, or live charge.

## Existing pieces
- `api/_shared/billing/sumupRecurring.js` implements a local in-memory recurring prototype, not a durable production worker.
- `supabase/migrations/20260926180000_billing_sumup_recurring.sql` provides locked-down instrument fingerprint and attempt tables but explicitly says local only.
- `api/_shared/billing/sumupInitialActivation.js` and `providerWebhookIngress.js` include verified setup activation logic.
- `api/_shared/billing/providers/sumup.js` reads `SUMUP_API_KEY` and `SUMUP_MERCHANT_CODE` on the server.

## Required before enabling recurring charges
1. Implement a server-only, authenticated renewal worker with durable database claim/lease, idempotent checkout references, reconciliation after timeouts, and no concurrent double charge. Do not rely on module memory.
2. Ensure an atomic DB operation advances the subscription period and records the successful charge exactly once. Verify cancellation and downgrade rules.
3. Validate database migrations on isolated Staging after a backup/recovery plan; never run local-only migrations in Production unchanged.
4. Wire a protected scheduler only after a working worker exists. Vercel Cron is Production-only; do not point it at Preview/Staging.
5. Use SumUp sandbox credentials scoped to Staging. Test initial 3DS setup, verified instrument, renewal, duplicate webhook, retry/timeouts, cancellation, failures, and incorrect credentials without real charges.
6. Confirm production environment variables exist server-side; do not expose API keys in client bundles, logs, screenshots, or PRs.
7. Keep the payment path disabled until all checks pass and the owner explicitly approves launch.

## Current action
This branch is for isolated development only. No payment requests, schema changes, or deployments have been performed.
