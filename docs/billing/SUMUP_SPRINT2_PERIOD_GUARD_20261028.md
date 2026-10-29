# Sprint 2: paid-period eligibility follow-up

Branch: feature/sumup-hosted-4sek-one-time. Starting commit: 1b46979.

## Change

A new follow-up migration replaces only billing.open_paid_plan_id. Paid subscription access requires current_period_start <= now < current_period_end. PAST_DUE additionally requires now < past_due_grace_until; a missing grace deadline denies paid access. Trusted admin-seed assignments retain their independent manual entitlement.

The existing reserve_quota implementation and the subscription-based 30-day quota window are reused. Historical migrations, reservations, usage, payment verification, checkout activation and recurring remain unchanged. Durable quota, usage and plan-comparison reads use the same eligibility rule, including fail-closed handling of missing subscription dates.

The migration was generated with the Supabase CLI, then sequenced after the existing 20261028110000 migration. It has NOT been applied to any remote database.

## Verification

- 33 unique targeted tests passed: 10 local PGlite/PostgreSQL tests executing the real quota reservation and new eligibility functions, plus 23 period/window/read tests.
- Covered future period start, exact period end, PAST_DUE before/at/missing grace deadline, period end despite remaining grace, manual assignments, private helper permissions, and the unchanged 30-day quota window.
- Read-adapter tests cover future start and grace boundaries; a prior incomplete fixture now includes its required subscription start.
- ESLint passed for changed JavaScript files; production build passed (existing chunk-size warning).
- Full-suite and unrelated main failures were not rerun.
- The local database test loads the quota/subscription foundation and quota-window function section, not every application migration or checkout activation path. No new end-to-end payment verification is claimed.

## Preview configuration inspected, read-only

Vercel access is available. Both branch-scoped SUPABASE_URL and VITE_SUPABASE_URL point to armtslzspuebmlysnooq (Staging). Branch-scoped SUMUP_API_KEY, SUMUP_MERCHANT_CODE, SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_ANON_KEY exist; their secret values were not read. Presence does not establish that the SumUp key is a sandbox key.

BILLING_PUBLIC_BASE_URL is configured for the branch Preview alias. A READY deployment exists at starting commit 1b46979. Project protection is enabled (all_except_custom_domains), and an unauthenticated HEAD to the configured alias's /api/billing/webhook returned HTTP 302. Public webhook delivery is therefore not verified. No protection settings were changed or bypassed. Vercel's protected-deployment skill was consulted; authenticated agent access would not prove that SumUp can deliver an unauthenticated webhook.

## PR relationship and next step

This branch contains PR #96's checkout foundation. The follow-up draft PR targets feature/sumup-hosted-one-time-sprint2, making the dependency explicit. Do not cherry-pick duplicate migrations or integrate the alternative review/sumup-quota-guard-alt-20261028 migration. After #96 is integrated, retarget this PR to main and review its resulting diff. No merge is authorized by this report.

Next: approve and apply only the new follow-up migration to the isolated Staging project, then establish a webhook endpoint reachable by SumUp before an authorized sandbox checkout. Confirm sandbox identity using the existing guarded path; no live checkout or recurring activation is part of this step.

No remote migrations, environment changes, real or sandbox payments, main changes, Production changes, or Live identity-verification changes were performed.
