# BILL-5A — Live enforcement orchestrator foundation

Status: **READY** (foundation only). Live routes are **not** wired.

BASE: `63f9e78211a707a576aa537c7e4a2d3220d6a035`

BILL-1 → BILL-4C production foundations remain intact. This sprint adds a
server-side coordinator and does not mutate staging, production, usage,
quota, subscription, thresholds, feature/provider controls, or audit.

## Live route inventory

Inventoried from current `api/` + called services (not prior assumptions).

### OPENAI (cost-driving)

| Path | Canonical feature | Notes |
| --- | --- | --- |
| `api/ai/index.js` (`chat`, `daily-coach`, `weekly-report`, `proactive-coach`, `study-buddy`) | `ai.text.request` | Direct `fetch` to `https://api.openai.com/v1/responses` |
| `api/ai/index.js` (`realtime-session`) | `ai.voice.session` | `createRealtimeVoiceSession` → `/v1/realtime/sessions` |
| `api/adaptive-coach/index.js` | `ai.text.request` | `callOpenAiJson` via `api/_shared/openaiGateway.js` |
| `api/nutrition-photo-analysis/index.js` | `food.scan` | Gateway type `photo` / vision |
| `api/forgotten-items-analysis/index.js` | `ai.eye.analysis` | Vision object-check; not a meal scan |
| `api/body-analysis/index.js` | `body.scan` | OpenAI hop in `src/services/bodyAnalysisAi.js` |

Shared hop: `api/_shared/openaiGateway.js`.

Client follow-on (not a Vercel function): `src/services/ai/realtimeVoiceController.js`
posts SDP to OpenAI Realtime after the server mints a session. Still OpenAI
cost, still `ai.voice.session`.

### GOOGLE CLOUD RUN AI EAR

| Path | Canonical feature |
| --- | --- |
| `api/ai-ear/interpret/index.js` | `ai.ear.interpret` |

`fetch(`${backendUrl}/v2/interpret`)` with a server-minted Google ID token.

### OTHER EXTERNAL

None found beyond OpenAI and Cloud Run AI Ear.

### LOCAL (not live cost-driving)

| Path | Notes |
| --- | --- |
| `api/meal-analysis/index.js` | Fail-closed after auth; never calls OpenAI |
| `api/analysis-consent/index.js` | Consent token |
| `api/account-deletion/index.js` | Account deletion |
| `api/billing/admin/index.js` | Billing admin |
| `api/billing/user/index.js` | Quota/subscription/entitlement read surface |

Cost-driving Vercel routes: **6**.

## Canonical mapping

`src/services/billing/liveCostOperations.js` points at existing
`BILLING_FEATURES` ids. It is not a parallel feature list.

Unknown route or ambiguous `api/ai` action → mapping `null` → fail-safe
(`INVALID_OPERATION` if used). Orchestrator `featureId` uses
`resolveFeatureId` only.

`PARTIAL` is never treated as `LOCAL_FREE`. `ai.voice.session` still requires
`openai`. Catalog-only PARTIAL ids with an empty provider list
(`gps.live.session`, `tts.request`, `smart_ai`) skip unrelated provider
outages but remain cost-driving for cost safety.

## Decision order

Implemented in `evaluateBillingOperation`:

1. **A. Auth** — verified server `userId` (UUID). Client `user_id` ignored.
2. **B. Canonical feature** — unknown → `INVALID_OPERATION`.
3. **C. Feature control** — BILL-4B `resolveFeatureAvailability`.
4. **D. Provider availability** — only required providers from
   `FEATURE_REQUIRED_PROVIDERS`.
5. **E. Effective plan** — BILL-3 `resolveEffectivePlan`. Client `plan_id`
   ignored.
6. **F. Entitlement** — plan entitlement `enabled !== true` → `DENY_ENTITLEMENT`.
   Explicit `UNLIMITED` continues without a quota inspect.
7. **G. Cost safety** — BILL-4C2b2 `resolveFinalCostSafety` for cost-driving
   features only. Client `costDriving` / `costSafe` / `ignoreHardStop` /
   `amount_minor` ignored.
8. **H. Quota plan** — `planQuotaEligibility` only. No reserve/commit/rollback.
9. **I. ALLOW / DENY**.

First deny wins: later resolvers are not called.

Existing 4C precedence is unchanged (invalid > hard stop > hard unavailable >
soft alert > soft unavailable > safe). Empty threshold set is
`NO_ACTIVE_THRESHOLD`: allow, and **not** the same as measured-safe.

## Auth

Authenticated operations (default): missing/invalid server `userId` →
`DENY_AUTH` before feature, provider, plan, cost, quota, or provider
execution. No client user authority.

## Feature / provider control

- DISABLED → `DENY_FEATURE_DISABLED`
- MAINTENANCE → `DENY_FEATURE_MAINTENANCE`
- ENABLED / default row → continue
- Required provider UNAVAILABLE → `DENY_PROVIDER_UNAVAILABLE`
- Required provider MAINTENANCE → `DENY_PROVIDER_MAINTENANCE`
- Invalid/unknown required provider id → `INVALID_OPERATION`
- Local features with `[]` providers are not blocked by OpenAI/AI Ear outage

## Plan / entitlement / cost / quota

- Effective plan from server subscriptions; baseline `plan.free` when none.
- Feature disabled by plan → `DENY_ENTITLEMENT`.
- `COST_HARD_STOP` → `DENY_COST_HARD_STOP` (quota inspect 0, provider 0).
- Hard-safety unavailable → `DENY_COST_UNAVAILABLE`.
- `COST_SOFT_ALERT` → ALLOW + warning metadata.
- Soft-only unavailable → ALLOW + warning metadata.
- No active threshold → ALLOW per 4C policy + `no_active_threshold: true`.
- Simulated inspect `remaining < quantity` → `DENY_QUOTA`.
- BILL-5A never writes quota.

## Quota reservation boundary (BILL-5B, not implemented)

```
evaluateBillingOperation
  → reserve quota (BILL-2)
  → provider call
  → commit actual
  or rollback if the provider call fails
```

If a later provider call fails after reserve, rollback/commit follows
existing BILL-2 reservation semantics. Cost hard stop must already have
denied, so quota is never reserved for a cost-denied operation.

## Short-circuit

| Gate | Later calls skipped |
| --- | --- |
| Auth fail | feature, provider, plan, cost, quota, provider exec |
| Feature disabled/maintenance | provider, plan, cost, quota, provider exec |
| Provider deny | plan still not required for cost/quota/exec (cost+quota+exec 0) |
| Cost hard / hard unavailable | quota inspect 0, provider exec 0 |
| Quota deny | provider exec 0 |

`executeProvider` is never invoked in this sprint.

## Safe output / errors

Returned fields: `decision`, `allowed`, `feature_id`, `reason_codes`,
`warnings`, cost reason/result, quota plan flags. Never prompt, response,
audio, image, GPS, health content, tokens, API keys, database URL, or
`service_role`.

Internal throws on a cost-driving (or any) evaluation → `DENY_INTERNAL`.
Error messages are not copied to the client-safe object.

## First BILL-5B canary (recommendation only — not wired)

**Route:** `api/nutrition-photo-analysis/index.js`
**Feature:** `food.scan`
**Provider:** `openai` via `api/_shared/openaiGateway.js`

Why this one: single Vercel handler, one canonical feature, one provider,
no Realtime/WebRTC second hop, already mapped as gateway type `photo`.
Do not start with `api/ai` (multiple actions) or voice (server session +
browser SDP).

## Historical limitations (unchanged)

- HISTORICAL TIMESTAMP: PARTIAL
- HISTORICAL COST: PARTIAL
- 50K FOUNDATION: PARTIAL

BILL-5A does not fix these.

## Remaining BILL-5B work

- Wire `evaluateBillingOperation` into one canary route after Hassan review
- Implement reserve → provider → commit/rollback
- Still no extra Vercel function if Hobby remains at 11/12
- No new migration unless a later sprint explicitly requires it

## Vercel functions

Still **11** `api/**/index.js` files. Hobby limit 12. BILL-5A added no route.

## Out of scope

No DB migration, no staging/production mutation, no OpenAI/AI Ear call from
the orchestrator, no live enforcement, no main merge, no Vercel deploy.
