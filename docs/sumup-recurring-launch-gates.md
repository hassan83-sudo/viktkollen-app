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


## Draft worker added 2026-10-24
- `sumupRenewalWorker.js` uses database-exclusive claims, server-owned pricing and customer facts, immutable binding before payment, fingerprint matching, and the existing verified settlement pipeline. A second process/restart only reconciles; it never repeats the payment PUT. Lost claims are deliberately not leased/reclaimed automatically.
- `sumupRenewalWorkerDatabase.js` uses fixed parameterized list/claim/bind RPCs. The restricted executor now accepts exact SQL statements, rather than SQL prefixes.
- New work-reader migration has no EXECUTE grants. The binding RPC enforces exactly one UTC calendar month and rejects pending plan changes. Pending plan changes are excluded from selection until their price/settlement rules are implemented.
- `scripts/run-sumup-renewal-staging.mjs` is manual and disabled by default. It requires separate `SUMUP_RENEWAL_STAGING_*` variables, validates the Staging database identity and SumUp's `sandbox: true` merchant identity, and refuses a Vercel Production environment. It does not fall back to general credentials. No credentials have been configured and this runner has not been run against SumUp.
- The bind SQL test rolls back its fixture so the subsequent commit test can retain the required unique subscription/period constraint.

### Verification and limitations
- 25 focused local tests passed, including a PGlite worker-to-SQL integration using the real claim, binding, reader and commit functions. The provider and `advance_subscription_period` are stubs in that integration; this is not a sandbox payment or full subscription lifecycle verification.
- Local isolated SQL binding/work/commit checks and targeted ESLint passed.
- Failed/expired payments remain durably claimed and return `failed_review_required`; automatic failure/grace finalization is not implemented in this worker.
- Pending plan changes are blocked, not charged at the old price.
- A crash between claim and payment may require manual recovery; automatic recharging is intentionally forbidden.
- Cancellation after the last eligibility check but before the provider response, and settlement after concurrent plan/cancellation changes, still require isolated lifecycle verification and an explicit recovery policy.
- The read/claim/bind/settlement role grants, Staging database provisioning, real sandbox end-to-end verification, and protected scheduling remain incomplete. No live migrations, charges, Production deployment, or cron activation were performed.
