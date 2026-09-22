# VERCEL-FN-1 — Serverless function limit audit

Status: **READY (audit only — no implementation)**  
Branch: `billing-cost-metering-sprint1`  
Base: `4a6527a2d205970e484aed61218d0e209f56c26d`  
Vercel plan change: **not done**. BILL-4C2b: **not started**. API routes: **unchanged**.

## Verified Vercel error

Preview deployments on this branch fail with:

> No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan.

This is a **Hobby function-count limit**, not an npm/Vite compile error. Local `npm run build` (Vite client) can still pass.

## Current function count

| | |
| --- | --- |
| TOTAL DEPLOYABLE FUNCTIONS | **13** |
| HOBBY LIMIT | 12 |
| OVER LIMIT BY | **1** |
| `origin/main` deployable functions | **10** (under limit) |
| Added on this branch | **3** billing routes |

Vercel maps each **non-private** file under `/api` to one Serverless Function. Folders/files prefixed `_` are helpers, not routes. `.vercelignore` excludes `api/**/*.test.js`.

There is no `.vcignore`. `vercel.json` does not rewrite or merge routes. `package.json` has no Vercel `functions` field. All handlers are **Node** (no Edge `runtime`).

**Why >12:** main already used 10 of 12 Hobby slots. BILL-2/3/4A added `/api/billing/quota`, `/api/billing/subscription`, and `/api/billing/admin` (+3). 10 + 3 = 13.

## Test files

`.vercelignore`:

```
api/**/*.test.js
```

22 `api/**/*.test.js` files are **not** deployable functions. If this ignore were removed, the count would explode. **TEST FILES DEPLOYED: NO.**

## Shared modules (not functions)

`api/_shared/**` is not routed (underscore prefix), including:

- `verifySupabaseUser.js`, `supabaseServer.js`, `aiRouteErrors.js`, `aiRateLimiter.js`, `aiRequestDeduper.js`
- `openaiGateway.js`, `googleIdToken.js`, `analysisConsent.js`, `entitlementMapper.js`, `coachResponseSchema.js`
- `billing/admin.js`, `billing/quota.js`, `billing/subscription.js`, `billing/recordOpenAiGatewayUsage.js`

Do not count these toward the Hobby limit.

## Full function inventory

All runtimes: **Node serverless**. Auth unless noted: **Supabase Bearer** via `verifySupabaseUser`. No provider webhooks exist.

| # | File | Public path | Methods | Purpose | Security | Provider | Billing | Special |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `api/ai/index.js` | `/api/ai` | POST (405 else) | Legacy coach / insights / realtime voice session mint | Authenticated user | OpenAI | Usage record helper only | JSON body |
| 2 | `api/adaptive-coach/index.js` | `/api/adaptive-coach` | POST | Adaptive coach JSON | Authenticated user | OpenAI | Gateway usage | JSON, 12KB cap |
| 3 | `api/ai-ear/interpret/index.js` | `/api/ai-ear/interpret` | POST | AI Örat → private Cloud Run | Authenticated user + origin allowlist + consent; **server** Google ID token to Cloud Run | Cloud Run / Google | No | `bodyParser: false`; `vercel.json` **maxDuration 30** |
| 4 | `api/nutrition-photo-analysis/index.js` | `/api/nutrition-photo-analysis` | POST | Nutrition photo | Authenticated + origin CORS + consent | OpenAI | Gateway usage | `bodyParser: false` |
| 5 | `api/forgotten-items-analysis/index.js` | `/api/forgotten-items-analysis` | POST | Forgotten-items vision | Authenticated + origin CORS + consent | OpenAI | — | `bodyParser: false` |
| 6 | `api/body-analysis/index.js` | `/api/body-analysis` | POST | Body scan (3 images) | Authenticated + consent; **no** origin allowlist | OpenAI (via bodyAnalysisAi) | — | `bodyParser: false` |
| 7 | `api/analysis-consent/index.js` | `/api/analysis-consent` | POST | HMAC consent token (hash only, no bytes) | Authenticated user | none | — | JSON |
| 8 | `api/meal-analysis/index.js` | `/api/meal-analysis` | POST | Legacy meal photo; **fail-closed 403** after auth | Authenticated user | none (never OpenAI) | — | JSON |
| 9 | `api/entitlements/index.js` | `/api/entitlements` | GET | `user_entitlements` snapshot | Authenticated; **self only** | none | Legacy entitlement table (not BILL-3 RPC) | JSON |
| 10 | `api/account-deletion/index.js` | `/api/account-deletion` | POST | Purge cloud/social; optional auth user delete | Authenticated; **Supabase service role** for deletes | none | Touches `user_entitlements` rows | Destructive |
| 11 | `api/billing/quota/index.js` | `/api/billing/quota` | GET | BILL-2 quota inspect | Authenticated; query `feature`/`unit`; **self** | none | BILL-2 | JSON |
| 12 | `api/billing/subscription/index.js` | `/api/billing/subscription` | GET | BILL-3 subscription snapshot | Authenticated; `user_id` query must match session | none | BILL-3 | JSON |
| 13 | `api/billing/admin/index.js` | `/api/billing/admin` | GET, POST | Admin session; grant/revoke | **`billing_admin`** via `requireBillingAdmin` | none | BILL-4A | JSON; client `isAdmin` ignored |

**BILLING FUNCTIONS: 3**  
**NON-BILLING FUNCTIONS: 10**  
**CURRENT PUBLIC API PATHS: 13**

### Route contracts (compact)

- **Unauthenticated:** existing handlers return the current `verifySupabaseUser` / `requireBillingAdmin` status (typically 401) with `{ ok: false, error }`. Do not invent a new public surface.
- **Wrong method:** 405 + `Allow` where already set.
- **GET `/api/billing/quota`:** `{ ok, quota, requestId }`.
- **GET `/api/billing/subscription`:** `{ ok, subscription, requestId }`; extra `user_id` ≠ session → 403 `FORBIDDEN_USER`.
- **GET `/api/billing/admin`:** `{ ok, session }` after admin check. **POST** `action=grant|revoke` + `target_user_id`; unknown action 400; non-admin 403.
- **GET `/api/entitlements`:** `{ ok, entitlement, verification, requestId }`.
- **POST analysis/AI routes:** existing safe-error envelope (`aiRouteErrors`); vision routes also 403 `corsBlocked` when origin fails.
- **POST `/api/meal-analysis`:** after auth/rate-limit, always 403 `CONSENT_REQUIRED`.
- **POST `/api/account-deletion`:** body `mode`: `dry-run` | `cloud-data` | `account`.

No webhook URLs. Do not change them later as part of count-fix.

## Security boundaries (do not mix)

| Boundary | Routes |
| --- | --- |
| Authenticated user, JSON, non-admin | quota, subscription, entitlements, analysis-consent, adaptive-coach, ai, meal-analysis |
| Authenticated user + origin CORS + multipart + OpenAI | nutrition-photo, forgotten-items |
| Authenticated user + multipart + OpenAI, no origin gate | body-analysis |
| Authenticated user + origin + consent; **outbound Google/Cloud Run service auth** | ai-ear |
| `billing_admin` | billing/admin |
| Authenticated user + **service_role destructive ops** | account-deletion |
| Public / anonymous product API | **none** |
| Provider webhook | **none** |

Admin must not share a dispatcher with normal-user billing. Account-deletion must not share with AI. AI Ear must not share with OpenAI vision (different provider secret, timeout, body type).

## CORS

- **Origin allowlist:** nutrition-photo, forgotten-items, ai-ear (`VERCEL_URL` / host).
- **No origin check:** billing, entitlements, consent, adaptive-coach, ai, meal-analysis, body-analysis, account-deletion.

Do not merge origin-gated vision with JSON billing. If vision routes are later dispatched together, **keep per-path origin behavior**.

## Timeout / memory / body parser

- Default Hobby duration (typically 10s) for most functions.
- **Only** `api/ai-ear/interpret/index.js` has `maxDuration: 30` in `vercel.json`. Keep that function separate so a merge does not apply 30s (or miss it).
- Multipart routes disable `bodyParser`. JSON routes rely on parsed/streamed JSON. **Do not** put JSON billing and raw multipart in one function without a careful parser split (high risk).

## Env keys (names only, no values)

| Group | Keys |
| --- | --- |
| Auth (almost all) | `SUPABASE_URL`, `VITE_SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY` |
| Entitlements / deletion | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_ROLE`, `ACCOUNT_DELETION_ENABLE_AUTH_DELETE` |
| OpenAI group | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_VISION_MODEL`, plus per-route rate/size/timeout keys |
| Consent | `ANALYSIS_CONSENT_SECRET` |
| AI Ear | `AI_EAR_ENABLED`, `AI_EAR_BACKEND_URL`, `AI_EAR_BACKEND_AUDIENCE`, `AI_EAR_GCP_SERVICE_ACCOUNT_JSON`, `AI_EAR_RATE_LIMIT_MAX`, `AI_EAR_MAX_BYTES`, `AI_EAR_TIMEOUT_MS`, `VERCEL_URL` |
| Vercel host | `VERCEL_URL` |

Secrets must never be logged or returned. This audit does not print values.

## Option A — recommended (minimal, path-preserving)

Use **one Node dispatcher per group** plus **`vercel.json` rewrites** so **public URLs stay identical**. Handlers keep the same method/auth/body checks; the dispatcher only selects the existing module by rewritten path.

### Group 1 — authenticated billing/entitlement **reads**

- **CURRENT:** `/api/billing/quota`, `/api/billing/subscription`, `/api/entitlements`
- **PROPOSED FUNCTION:** one file e.g. `api/billing/user/index.js` (name TBD in VERCEL-FN-2)
- **PUBLIC PATHS PRESERVED:** YES (rewrites)
- **AUTH BOUNDARY:** verified user, self-scoped GET only; **not** admin
- **EXPECTED REDUCTION:** 3 → 1 (−2)
- **RISK:** LOW (same auth, JSON, no provider, no multipart)
- **Do not include:** `/api/billing/admin`

### Group 2 — OpenAI vision with origin CORS

- **CURRENT:** `/api/nutrition-photo-analysis`, `/api/forgotten-items-analysis`
- **PROPOSED FUNCTION:** one multipart vision dispatcher
- **PUBLIC PATHS PRESERVED:** YES
- **AUTH BOUNDARY:** user + origin + consent; keep **per-path** validation/rate-limit/env
- **EXPECTED REDUCTION:** 2 → 1 (−1)
- **RISK:** MEDIUM (shared `bodyParser: false`; must not weaken either validator)
- **Do not include:** body-analysis (no origin gate, 3-image contract), ai-ear, analysis-consent

### Leave as dedicated functions (not combined)

- `/api/billing/admin` — admin boundary  
- `/api/ai-ear/interpret` — Google + 30s duration  
- `/api/body-analysis` — different CORS/body  
- `/api/adaptive-coach`, `/api/ai` — different product/legacy + voice mint  
- `/api/analysis-consent` — token issuer, no image bytes  
- `/api/meal-analysis` — fail-closed legacy  
- `/api/account-deletion` — service_role destructive  

### After Option A

| | |
| --- | --- |
| CURRENT FUNCTIONS | 13 |
| PROPOSED FUNCTIONS | **10** |
| HOBBY LIMIT | 12 |
| MARGIN | **2** |

Target 10 (not 12) for Hobby headroom. Avoid collapsing everything into 1 function (blast radius).

**Phase 1 only (if FN-2 must be tiny):** Group 1 alone → **11** functions, margin **1**. Enough to deploy; little headroom.

## Option B — alternatives (not recommended as first move)

1. **Hobby → Pro:** raises the function cap. Valid ops fallback; **do not purchase in this sprint**. Architecture should still drop the extra billing slots so Preview on Hobby works.
2. **Single `/api/index.js` catch-all:** HIGH risk, mixes admin/user/vision/Google, one timeout/memory profile. Reject for FN-2.
3. **Catch-all `/api/billing/[...path]` including admin:** mixes `billing_admin` with user GET. Reject unless admin stays a **separate** function (that is Option A group 1).
4. **Delete unused `/api/meal-analysis`:** would save 1 slot but **changes public API** (path gone). Blocker unless product explicitly retires the URL. Not in FN-1.

## Public path preservation

Option A lists **no path changes**. Rewrites:

- `/api/billing/quota` → billing-user dispatcher  
- `/api/billing/subscription` → billing-user dispatcher  
- `/api/entitlements` → billing-user dispatcher  
- `/api/nutrition-photo-analysis` → vision dispatcher  
- `/api/forgotten-items-analysis` → vision dispatcher  

If a rewrite cannot preserve query strings or GET vs POST, that is a **blocker** — do not ship.

## Implementation order (future VERCEL-FN-2 only)

1. Billing-user dispatcher + rewrites + tests (unblocks Hobby: 13→11).  
2. Preview deploy confirm function count.  
3. Vision pair dispatcher if more margin wanted (11→10).  
4. Stop. Do not merge admin, ear, deletion, or coach.

## Regression test plan (future)

Per consolidated group:

- **anon:** 401 / existing unauthenticated contract  
- **authenticated self:** 200 existing JSON shape  
- **authenticated other `user_id`:** 403 on subscription  
- **billing_admin:** still 403 on user dispatcher; 200/400 on `/api/billing/admin`  
- **service/trusted:** ai-ear still mints Google token server-side only; account-deletion still not callable as admin-billing  
- **method:** POST to GET-only → 405  
- **unknown path/action:** 404/400 per **current** contract, not a new open proxy  
- **body validation:** existing invalid JSON / missing feature / consent failures unchanged (not weaker)  
- **CORS:** vision 403 `corsBlocked` for bad origin; billing unchanged (no origin gate)

## Rollback

Revert the FN-2 commit(s) that add dispatcher + `vercel.json` rewrites. Restore the original `index.js` files. No DB/migration involved.

## Risks

- Rewrites mis-configured → 404 on old URLs (HIGH impact, LOW if tests hit public paths).  
- Shared vision function accidentally enabling `bodyParser` → broken uploads.  
- Mixing admin into user dispatcher → privilege bug (avoid).  
- Hobby `maxDuration: 30` on ai-ear may still be plan-incompatible; that is **separate** from the count error. Do not “fix” it by merging ear into another function.

## What this sprint did not change

API behavior, Vercel routing, runtime architecture, billing logic, Supabase, production, main, Vercel plan.
