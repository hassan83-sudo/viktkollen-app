# Support alerts: staging activation checklist

Status: code added on PR #35, **not activated in Production**.

The admin browser notification only works with the panel open. The separate server endpoint `GET /api/support-alerts` supports background email delivery without a browser. It requires a trusted scheduler, a verified sender and the private support schema.

1. Apply migration `20261017180000_support_alert_delivery.sql` **only to the separate staging Supabase project** after review.
2. Configure **Preview/Staging only**: `CRON_SECRET` (random high-entropy value), `RESEND_API_KEY`, `SUPPORT_ALERT_FROM` (verified sender), `SUPPORT_ALERT_TO` (admin-controlled mailbox). Never use a customer address for `SUPPORT_ALERT_TO`. Keep secrets server-side.
3. Configure a scheduler (for example Vercel Cron, where plan cadence permits) to call `GET /api/support-alerts` with `Authorization: Bearer <CRON_SECRET>`. **No scheduler has been enabled by this PR.** Verify the actual supported schedule on the deployment plan. The endpoint does not send anything unless invoked.
4. Create one synthetic paid support ticket in staging. Trigger the scheduler and verify one generic email arrives in the admin mailbox. Trigger it again and verify no duplicate. Test a new ticket version, a failed provider response and a missing/wrong cron secret.
5. Verify an unauthenticated user cannot read `support.alert_deliveries` or invoke `support.claim_pending_alerts`. Verify the delivery endpoint returns 401 without the secret and 503 if required settings are missing.
6. Inspect delivery logs, provider billing and retry behavior before production rollout. Email delivery can fail; this is not guaranteed instant notification. Consider an independent monitoring alert for failed cron runs.

Do not merge or deploy to Production until staging delivery is proven and approved.
