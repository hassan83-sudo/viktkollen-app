# SumUp recurring: launch gates

Status: NOT READY FOR PRODUCTION. This document does not authorize a deployment, migration, or live charge.

## Current Staging handover — Sprint 1, 2026-10-24

Target: `armtslzspuebmlysnooq` only. The earlier sections below are historical
implementation/verification notes; the following installation status supersedes
their statements that these migrations have not been installed.

The interrupted pending-plan migration was absent (both snapshot columns were
missing). Only that missing payment/lifecycle migration was applied in this
continuation, in an explicit transaction with lock/statement timeouts. The four
already-installed migrations were NOT rerun. The six earlier synchronized
renewal versions `20261024065246` through `20261024065325` were preserved.

Local filenames and CI/test references now match Staging's actual history:

| Version | Migration | This continuation |
| --- | --- | --- |
| 20261024082814 | sumup_renewal_worker_draft | Already installed; not rerun |
| 20261024082822 | sumup_renewal_failure_draft | Already installed; not rerun |
| 20261024082853 | sumup_renewal_bind_checkout_draft | Already installed; not rerun |
| 20261024083012 | sumup_renewal_recovery_draft | Already installed; not rerun |
| 20261024083536 | sumup_renewal_pending_plan_draft | Installed transactionally |
| 20261024083855 | sumup_renewal_staging_worker_role | New restricted Staging role |

Recovery was installed before the pending-plan repair during the interrupted
session. Its PL/pgSQL references now resolve to the restored plan columns. The
complete migration order is tested locally; no migration-history records were
rewritten and no installed migration bodies were changed.

Role `sumup_renewal_staging_worker` has exactly eight billing RPC EXECUTE grants:
facts reader, work list, exclusive claim, checkout binding, verified commit,
verified failure, recovery list and observation recording. It has schema USAGE,
but no direct billing-table privileges or schema CREATE. It is NOLOGIN,
NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS;
connection limit 2, statement timeout 15 seconds, lock timeout 5 seconds.
It has no membership in any other role. PostgreSQL granted its creating
administrator (`postgres`) membership; no application identity was added.
anon/authenticated remain denied on all eight RPCs.

The first role-provisioning transaction rolled back because its membership
assertion also rejected PostgreSQL's automatic creator membership. The guard
was corrected to allow only the creator and to forbid all worker memberships
in other roles; the corrected transaction succeeded. No privileges from the
failed transaction persisted.

Verified against real Staging, with NO SumUp communication:
- enabled BEFORE INSERT OR UPDATE snapshot trigger and both new plan columns;
- expected RPCs, lifecycle dependencies and fixed security-definer search paths;
- malformed bound snapshot rejected with `sumup_renewal_plan_price_mismatch`;
- zero-limit work/recovery reads and nonexistent-subscription facts read;
- role flags, exact RPC allowlist, denied client execution and zero direct table rights;
- all 65 subscription rows retain the same aggregate checksum, and renewal
  attempts remain empty. The trigger/RPC probe transaction was rolled back.

The MCP connection refused SET ROLE, so no successful impersonation or direct
restricted-login connection is claimed. The role deliberately has no password
and remains NOLOGIN. Authentication must be provisioned securely before a real
worker connection can be tested; service_role/postgres must not replace it.

Still missing, to be supplied through secure local/server configuration (never
chat, command arguments, commits or logs):
- `SUMUP_RENEWAL_STAGING_DATABASE_URL`: TLS-verified Staging-only connection for
  the reviewed restricted role, after separately provisioning its login/password.
  Direct hostname must be `db.armtslzspuebmlysnooq.supabase.co`; a Supavisor URL
  must identify this project in the username. No broad database credentials.
- `SUMUP_RENEWAL_STAGING_API_KEY`: independently verified Sandbox key. The
  existing generic `SUMUP_API_KEY` is a write-only Vercel Secret and is not read
  or copied; the runner intentionally has no generic-key fallback.
- `SUMUP_RENEWAL_STAGING_MERCHANT_CODE`: merchant whose identity the runner
  will retrieve and require to have `sandbox: true` before any payment.
- `SUMUP_RENEWAL_STAGING_PROJECT_REF=armtslzspuebmlysnooq`.

Keep `SUMUP_RENEWAL_STAGING_ENABLED` unset/false. No worker, provider request,
schedule, deployment or automatic charging was enabled. Staging SQL access via
MCP is NOT evidence that the restricted PostgreSQL connection is configured.
The current script processes the eligible queue, so a later Sandbox run also
requires an explicitly isolated test subscription/selection before enabling it;
do not run the script against the shared test queue indiscriminately.

Focused local verification: 17 tests passed (new role boundary and actual
chronological migration installation, plus the two
integration files whose migration paths changed). The existing 149-test/13-test
approved suites were not rerun in full. No sandbox payment result is claimed.
Targeted ESLint and diff whitespace checks passed. The security advisor returned
no billing findings; it reported policy-free private RLS tables in other schemas
and [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
Those unrelated settings were left unchanged. Nothing was pushed or deployed
as part of this Staging provisioning step; no new remote CI run is claimed.

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
- New work-reader migration has no EXECUTE grants. The binding RPC enforces exactly one UTC calendar month. The additive pending-plan migration below supplies target-plan pricing and settlement.
- `scripts/run-sumup-renewal-staging.mjs` is manual and disabled by default. It requires separate `SUMUP_RENEWAL_STAGING_*` variables, validates the Staging database identity and SumUp's `sandbox: true` merchant identity, and refuses a Vercel Production environment. It does not fall back to general credentials. No credentials have been configured and this runner has not been run against SumUp.
- The bind SQL test rolls back its fixture so the subsequent commit test can retain the required unique subscription/period constraint.

### Verification and limitations
- 25 focused local tests passed, including a PGlite worker-to-SQL integration using the real claim, binding, reader and commit functions. The provider and `advance_subscription_period` are stubs in that integration; this is not a sandbox payment or full subscription lifecycle verification.
- Local isolated SQL binding/work/commit checks and targeted ESLint passed.
- Failed/expired payments are finalized by the verified failure boundary described below; no automatic recharge is permitted.
- Pending plan changes use the immutable target-plan snapshot described below.
- A crash between claim and payment may require manual recovery; automatic recharging is intentionally forbidden.
- Cancellation after the last eligibility check but before the provider response, and settlement after concurrent plan/cancellation changes, still require isolated lifecycle verification and an explicit recovery policy.
- The read/claim/bind/settlement role grants, Staging database provisioning, real sandbox end-to-end verification, and protected scheduling remain incomplete. No live migrations, charges, Production deployment, or cron activation were performed.


## Verified failure finalization added 2026-10-24
- The worker now sends matching FAILED/EXPIRED checkouts to `sumupRenewalFailureService.js`, which independently loads authoritative facts and re-fetches the checkout. PAID, PENDING, mismatched and contradictory SUCCESSFUL transaction responses cannot authorize a failure write.
- The restricted failure RPC locks subscription then attempt, validates the exact bound reference/customer/period, calls the existing `billing.mark_renewal_failed` function and marks the attempt failed in one transaction. It does not advance the period or grant quota. Grace is derived from the original period plus 168 hours, rather than retry time; an existing PAST_DUE grace is preserved by the existing lifecycle function. Pending plan fields remain unchanged.
- Duplicate SQL finalization is idempotent; failed attempts are excluded from the work queue. An ambiguous response remains subject to reconciliation without another charge.
- The failure migration has no EXECUTE grants and has not been applied to Staging or Production.
- Verification: 40 affected local tests passed, including FAILED and EXPIRED worker-to-SQL flows using the real `mark_renewal_failed` migration (SumUp transport remains mocked). Isolated SQL also covers replay, wrong checkout, cancellation, existing grace/pending-plan preservation, denied public execution, and transaction rollback if attempt finalization fails. Targeted ESLint and diff checks passed.
- Still incomplete: concurrent lifecycle recovery policy, restricted role provisioning, real sandbox end-to-end verification, and scheduling.


## Pending-plan pricing and settlement added 2026-10-24
- Additive draft migration `20261024083536_sumup_renewal_pending_plan_draft.sql` replaces selection, binding, snapshot guarding and successful commit after the existing binding migration. Earlier migration versions are unchanged. The CLI-generated file was ordered after the existing future-dated binding migration to preserve dependencies.
- A stored next-period change uses the target plan's active server catalog price and version. Binding saves immutable `expected_plan_id` and `expected_plan_version` alongside customer, amount, currency and period. Missing/inactive/wrong-currency targets cannot fall back to charging the old plan.
- The worker compares the database-returned bound price/customer/currency with the checkout before any payment PUT and again at the final eligibility check. A stale candidate price cannot authorize charging a checkout at an old amount.
- Verified successful settlement requires the same effective plan ID/version/price, invokes the existing real `advance_subscription_period` lifecycle, and checks the resulting plan/version/period with the pending fields cleared. Same-price plan substitutions or changed catalog versions are refused. Failed payments preserve the current plan and pending change.
- Previously bound attempts without a plan snapshot are not silently backfilled or recharged; successful settlement requires manual review.
- Verification uses the real pending-plan and failed-renewal lifecycle migrations with mocked SumUp. PAID, FAILED and EXPIRED worker flows pass. Isolated SQL covers correct target price, immutable plan snapshots, same-price plan substitution, version changes, duplicate settlement, invalid target selection and unchanged current-plan renewal pricing. No hosted database, privileges, credentials, scheduler or charges were changed.
- Remaining: concurrent lifecycle/abandoned-claim recovery policy, restricted role provisioning, real isolated SumUp sandbox verification and protected scheduling.


## Durable interruption and lifecycle-conflict recovery added 2026-10-24
- `sumupRenewalRecovery.js` reconciles original, unresolved attempts using an independent database queue. It does not filter them by today's subscription eligibility, so cancellation, terminal status, a different pending plan or an advanced period cannot hide an earlier checkout.
- The worker only retrieves the original bound checkout and verifies customer/reference/merchant/currency/amount and a successful transaction for PAID. It has no checkout creation, payment PUT, refund, lease expiry or claim-reset path.
- Additive draft migration `20261024083012_sumup_renewal_recovery_draft.sql` stores provider outcome, transaction ID, reconciliation time and review state on the existing RLS-protected attempts table. PAID evidence and its transaction ID cannot be replaced by a later failed/pending/unverified response; observed transaction IDs are unique across attempts.
- Eligible, verified outcomes are handed to the existing settlement/failure boundary. If the subscription/catalog/instrument no longer matches the original snapshot, the payment evidence is saved as `review_required` without changing the subscription. Unbound claims and legacy snapshots are held for manual investigation rather than automatically recharging. This establishes a conservative recovery policy; it does not perform refunds or resolve business conflicts automatically.
- Provider/settlement errors retain verified evidence and flag review when the database is available. If review cannot be persisted, the response explicitly remains `reconciliation_required`; the original claim remains durable for a later run.
- Queue order uses last reconciliation time to avoid repeatedly selecting only the oldest unresolved attempts. Settled attempts leave the recovery queue. Concurrent recovery remains safe because observations and the existing settlement RPCs lock the same subscription-before-attempt order.
- The disabled manual Staging runner now runs recovery before processing new due renewals. New RPCs have no EXECUTE grants. No hosted database, credentials, grants, scheduling or payments were changed.
- Verification: eleven worker-to-SQL recovery cases cover verified paid/failed settlement, cancellation, terminal subscriptions, same-price plan changes, advanced periods, pending/unbound attempts, provider failure, mismatched identity and settlement failure. SumUp is mocked; the lifecycle SQL is real. A separate database-outage test confirms no false claim that review was persisted. Isolated PostgreSQL test cases cover durable evidence after cancellation, conflicting transaction/reversed outcome rejection and denied public capabilities. Targeted ESLint and diff checks passed.
- Remaining before activation: dedicated restricted database role provisioning, real isolated SumUp sandbox end-to-end verification and protected scheduling. Manual review records do not themselves resolve cancelled/changed subscription payments.
