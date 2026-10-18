# Support alerts: staging activation checklist

Status: code added on PR #35, **not activated in Production**.

The admin browser notification only works with the panel open. The separate server endpoint `GET /api/support-alerts` supports background email delivery without a browser. It requires a trusted scheduler, a verified sender and the private support schema.

1. Apply migration `20261017180000_support_alert_delivery.sql` **only to the separate staging Supabase project** after review.
2. Configure **Preview/Staging only**: `CRON_SECRET` (random high-entropy value), `RESEND_API_KEY`, `SUPPORT_ALERT_FROM` (verified sender), `SUPPORT_ALERT_TO` (admin-controlled mailbox). Never use a customer address for `SUPPORT_ALERT_TO`. Keep secrets server-side.
3. Configure an approved scheduler to call `GET /api/support-alerts` with `Authorization: Bearer <CRON_SECRET>`. **Vercel Cron invokes Production deployments only; it cannot schedule this Preview.** Do not add a Production cron to test Staging. No scheduler has been enabled by this PR. The scheduler also needs approved access through Preview Deployment Protection; do not disable protection. Provision the same secret securely to the scheduler and the branch-scoped Preview when setting it up.
4. Create one synthetic paid support ticket in staging. Trigger the scheduler and verify one generic email arrives in the admin mailbox. Trigger it again and verify no duplicate. Test a new ticket version, a failed provider response and a missing/wrong cron secret.
5. Verify an unauthenticated user cannot read `support.alert_deliveries` or invoke `support.claim_pending_alerts`. Verify the delivery endpoint returns 401 without the secret and 503 if required settings are missing.
6. Inspect delivery logs, provider billing and retry behavior before production rollout. Email delivery can fail; this is not guaranteed instant notification. Consider an independent monitoring alert for failed cron runs.

Do not merge or deploy to Production until staging delivery is proven and approved.

## Verified on 2026-10-17

- Vercel CLI access works for `appsonthego-s-projects/viktkollen-app`; the connector returns 403 for this scope.
- The PR commit `41907f1` failed during Preview publication with `exceeded_serverless_functions_per_deployment` (Hobby limit: 12); its client build had completed successfully. The repair moves the alert handler under `api/_shared/aiHelp/` and reuses `/api/ai` through a rewrite, keeping the public URL `/api/support-alerts`. The function-count regression check now also counts standalone JavaScript/TypeScript endpoints.
- `CRON_SECRET` was created as a Secret for Preview and branch `codex/ai-support-review` only. It is not active in an existing deployment until that deployment receives the new configuration. `RESEND_API_KEY`, `SUPPORT_ALERT_FROM`, and `SUPPORT_ALERT_TO` were absent in the inspected project variable listing. Do not use placeholder addresses or enable sending until approval.
- Staging has `support.alert_deliveries` with RLS and `support.claim_pending_alerts(integer)`. anon/authenticated have no SELECT/INSERT/UPDATE on the table or EXECUTE on the function; service_role has these privileges. No grants or policies were changed.
- A rollback-only Staging transaction with the existing paid test customer verified initial claim, suppression of immediate duplicate claims, suppression after state=sent, a new-version claim, retry after state=failed, and suppression of a second immediate retry. All six checks passed. It sent no emails and persisted no test data. Concurrent workers and real provider delivery were not exercised by this transaction.
- Relevant local tests: 24 passed. Targeted lint passed. A local client build passed with the existing large-chunk warning. These checks do not establish a successful Vercel deployment or actual mailbox delivery.

## Delivery limits still requiring review

The stable provider key is `support-<ticket_id>-<ticket_version>`. Resend retains idempotency keys for 24 hours (https://resend.com/changelog/idempotency-keys). If the provider accepts a message but the database cannot persist state=sent, a retry outside that window can send a duplicate. Do not describe the current implementation as an unconditional exactly-once guarantee. An approved delivery test must inspect both provider delivery and mailbox receipt, then repeat the invocation and inspect the delivery ledger.

Staging currently has neither pg_cron nor pg_net installed. No new scheduler infrastructure, paid service, real email, or Production change was activated during this inspection. Scheduler selection and the missing email configuration remain blocked on the approved infrastructure and sender/recipient details.

## Preview function inventory

The 13th entry was `api/support-alerts.js`, now an internal module rather than a separate deployed function. These 12 entrypoints remain:

| Function source | Public base URL |
| --- | --- |
| api/account-deletion/index.js | /api/account-deletion |
| api/adaptive-coach/index.js | /api/adaptive-coach |
| api/ai/index.js | /api/ai |
| api/ai-ear/interpret/index.js | /api/ai-ear/interpret |
| api/analysis-consent/index.js | /api/analysis-consent |
| api/billing/admin/index.js | /api/billing/admin |
| api/billing/user/index.js | /api/billing/user |
| api/body-analysis/index.js | /api/body-analysis |
| api/forgotten-items-analysis/index.js | /api/forgotten-items-analysis |
| api/meal-analysis/index.js | /api/meal-analysis |
| api/nutrition-photo-analysis/index.js | /api/nutrition-photo-analysis |
| api/object-bank-scan/index.js | /api/object-bank-scan |

Existing aliases and billing rewrites are unchanged. `/api/support-alerts` now rewrites to `/api/ai?__vk_route=support-alerts`, whose handler still requires the scheduler secret before database or email access. No cron or email delivery is enabled by this routing repair.
