# Issue #65 — offline wardrobe isolation

Date: 2026-10-22. Branch: `feature/ai-eye-wardrobe-link-20261022` only.
Baseline imported from the same branch: `3dbc671c4dcb33cb0e268af5e50a1de523bbd953`.
Implementation commit: `9fd9bd86fbe518d164b0edb8bca292a0a070adef` (local only).

## Decision

Final review: **GO for a separately approved GitHub push of the reviewed branch**, because its Git-triggered Vercel build is now pinned to the guarded `npm run build` and `dist` output in repository configuration. Missing configuration must fail the build; GO does not promise a READY deployment or authorize a push. See [final review](SPRINT_65_FINAL_REVIEW.md).

**NO-GO for deployment or live AI.** Local offline isolation is implemented and verified with synthetic configuration. Vercel variables and the running Preview were not changed. Existing deployments retain their old code/configuration and must not be used for login, AI or writes based on this report.

No real Auth, Supabase, OpenAI, payment, mail or webhook requests were made. The tests use mocks, local files and in-memory database fixtures. No main, Production, other branch, database, key or external environment setting was changed. Nothing was pushed: this branch has automatic Vercel deployments and the user prohibits deployment in this sprint.

## Inventory and risks

The reproducible [inventory](wardrobe-isolation-inventory.json) lists every physical function, all 31 rewrites and external-call sites in API/client source. Regenerate with `node scripts/auditWardrobeIsolation.mjs --write` after source changes. The inventory is a source audit, not a claim that an external service was contacted.

| Physical Vercel function | Risk behind entry | Offline action |
| --- | --- | --- |
| `api/account-deletion/index.js` | Auth lookup, purge RPCs, row deletion, Auth Admin deletion | 503 before request/auth access |
| `api/adaptive-coach/index.js` | Auth, quota/usage, OpenAI | Same |
| `api/ai/index.js` | Legacy AI/voice; support writes; mail alarms; cost ledger; security/bug monitoring | Same, before alias dispatch |
| `api/ai-ear/interpret/index.js` | Google token exchange, Cloud Run, ACRCloud, quotas | Same, before humming dispatch |
| `api/analysis-consent/index.js` | Auth and image/audio consent tokens | Same |
| `api/billing/admin/index.js` | Admin reads/control changes/audit writes | Same |
| `api/billing/user/index.js` | Quotas/plans, subscription changes, SumUp and webhooks | Same, before alias dispatch |
| `api/body-analysis/index.js` | Auth, durable quota/usage, vision AI | Same |
| `api/forgotten-items-analysis/index.js` | Consent, durable quota/usage, vision AI | Same |
| `api/meal-analysis/index.js` | Auth, quotas, AI | Same |
| `api/nutrition-photo-analysis/index.js` | Consent, durable quota/usage, vision AI | Same |
| `api/object-bank-scan/index.js` | Wardrobe/object recognition; consent, quota, AI | Same |

All methods, including OPTIONS, are denied with `503 WARDROBE_STAGING_API_DISABLED` and `Cache-Control: no-store`. This is intentional, not an authentication failure. Rewrites do not get a special bypass. Tests cover all physical routes and all aliases, including conflicting query route selectors and webhook/cron paths.

`api/_shared` is a utility directory, not another public function entry. `api/**/*.test.js` is excluded by existing `.vercelignore`. No new deployable function, cron, middleware or rewrite was added. Vercel's utility-file convention is documented in [Advanced Configuration](https://vercel.com/docs/functions/configuring-functions/advanced-configuration). Existing Supabase Edge Function `supabase/functions/reminder-push` belongs to separate infrastructure; it was neither invoked nor changed by this work.

| Other surface | Risk / containment |
| --- | --- |
| `supabaseServer`, `verifySupabaseUser` | Offline denial precedes client construction and even injected test overrides. No inherited URL/key fallback in guarded scope. |
| Shared AI Help/Coach/support/alerts/security/bug handlers | Guard also applies to direct internal handler invocation, before auth and mail/DB work. |
| OpenAI gateway, voice sessions | Offline denial even when a global provider key exists. Legacy direct OpenAI fetches remain behind guarded physical entries. |
| AI Ear provider transport / Google token exchange | Guard before provider HTTP calls or cached-token lookup. |
| SumUp transport | Guard before HTTP dispatch. Normal billing logic is unchanged. |
| AI Help cost ledger | Factory and RPC-call denial in guarded scope; no inherited cost URL/credential used. |
| Browser direct OpenAI/client services, social, backups, monitoring, weather | Offline HTML uses a separate minimal entry which reuses the existing wardrobe/outfit components, never mounts App/auth/cloud effects. CSP `connect-src 'self'` blocks external fetch/WebSocket connections. All same-origin APIs are denied server-side. Live weather is visibly unavailable; existing normal app/weather behavior is retained outside offline scope. |
| Browser images/camera/local history | Explicit local image consent, raster-only thumbnails, no automatic upload; existing camera remains local. Wardrobe history/outfits retain original browser storage. |

## Identity and configuration rules

Runtime: wardrobe markers, the exact wardrobe branch, unknown environment, or a missing provider branch/environment marker cause offline denial. Only an explicitly identified unrelated environment/branch retains its existing behavior. HTTP headers, origin, URL and user claims cannot select an unguarded environment.

Build: actual local Git branch and provider markers must agree. Unknown/detached source identity fails closed; do not work around that by spoofing provider variables. If a future Vercel checkout lacks branch identity, stop and review that build integration separately. Real `vite build --mode test` still executes the build gate. Vitest's separate test configuration represents ordinary mocked regression fixtures with explicit unrelated development markers; it does not disable the real build gate.

Final review closed the generic `serve + mode=test` exception: only the Vitest process marker or an explicit local browser fixture with exact loopback URL and one of the two known synthetic public values can bypass the development-server gate. Neither exception applies to `build`. `WARDROBE_LOCAL_A11Y_FIXTURE` belongs only to local Playwright server processes; it must not be configured in Vercel. It also forces server-side API denial, regardless of other local deployment metadata. Offline CSP sets `worker-src 'none'` so worker/service-worker scripts cannot create an independent outbound channel.

Guarded builds require dedicated variables below and ignore inherited Supabase client settings. `envPrefix: []` stops automatic `VITE_*` inheritance; only the explicitly selected public Staging URL/key and offline flag are defined. A public-variable secret check rejects server credentials, legacy service-role JWTs and public values containing server credentials. No server secret is placed in `define` or returned to clients.

The offline browser module exposes no login and creates no Supabase client. It is a public local demo, **not** a synthetic authenticated session. The AI control is unavailable. No monetary budget or server quota is modified; AI is entirely disabled rather than assumed affordable. Re-enabling AI is a separate review requiring proven Staging routing and a monetary cost guard.

Legacy JWT role/project claims are checked as configuration metadata only, not as user authentication or cryptographic proof. Opaque `sb_publishable_` / `sb_secret_` keys cannot be tied cryptographically to a project by offline inspection. Their project ownership must be attested securely in the Staging dashboard by the operator before any future live use. No external request is needed or allowed for the offline fixture build.

## Future variables — not configured by this sprint

Every operator-managed row below must have scope **Preview + `feature/ai-eye-wardrobe-link-20261022` only**. Preserve global Preview, Production and all other branches.

| Exact variable | Required value / origin | Classification |
| --- | --- | --- |
| `WARDROBE_STAGING_BRANCH` | Exact feature branch above; deployment intent | Non-secret config |
| `WARDROBE_STAGING_PROJECT_REF` | `armtslzspuebmlysnooq`; Staging dashboard identity | Non-secret config |
| `WARDROBE_STAGING_SUPABASE_URL` | `https://armtslzspuebmlysnooq.supabase.co`; same project | Non-secret config |
| `WARDROBE_STAGING_ANON_KEY` | Verified public publishable or matching legacy anon key from that Staging project | Public credential; this is the only key permitted in the browser configuration |
| `WARDROBE_STAGING_SERVICE_ROLE_KEY` | Existing dedicated Staging server key, verified in its project; must differ from inherited global service-role key | Vercel Secret / sensitive; never `VITE_*`, never console, source, docs or CLI argument |
| `WARDROBE_STAGING_OFFLINE` | Exact lowercase string `true` | Non-secret config |
| `WARDROBE_STAGING_AI_DISABLED` | Exact lowercase string `true` | Non-secret config |

Provider-supplied `VERCEL_ENV=preview` and `VERCEL_GIT_COMMIT_REF=feature/ai-eye-wardrobe-link-20261022` must be present at build and function runtime. Verify their availability; do not manually forge them. No global `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_ROLE`, cost-ledger credential, Humming credential or `OPENAI_API_KEY` needs changing. Guarded APIs never consume them. `VITE_WARDROBE_OFFLINE` is a build-derived constant, not an operator-managed escape hatch.

Future order (requires separate explicit approval):

1. Review the exact local commits and approve only the seven branch-scoped settings. Record existing branch entries without exporting secret values; do not edit/delete global entries. Have the operator supply the existing dedicated Staging Secret in Vercel's protected input.
2. Validate scope, provider markers, source identity, public-key role and Staging ownership of opaque keys. Stop on missing/unreadable provenance. Run the local negative tests and synthetic build first.
3. Obtain deployment/push approval separately. A push can automatically deploy; it is not authorized by this runbook.
4. Inspect the resulting artifact before opening it: minimal offline entry, no inherited Production reference/keys or server credentials, effective CSP. Then verify 503/no-store on every function and alias with no auth session; no provider requests, cost rows, support mail or database writes should occur.
5. Verify local wardrobe behavior in that artifact. No login or real AI test is part of offline acceptance.
   Use a fresh immutable deployment URL/browser context, not a previously used branch alias with possible old app/service-worker caches. A failed new build does not repair or remove the previous unsafe deployment.
6. Rollback means removing only the seven newly added branch entries after checking their recorded IDs/scope, and decommissioning/reverting only the approved branch artifact under separate approval. Never expose the previous unisolated Preview as a test environment. Do not delete or edit the global Preview key.

## Executed validation

- `node scripts/verifyWardrobeOfflineBuild.mjs`: PASS. Six real negative Vite builds rejected missing provider/branch identity, wrong project, enabled AI and public server credentials, including with `--mode test`. Positive synthetic build passed; ten emitted public text files contained neither inherited Production configuration nor synthetic server canaries. No environment value was printed.
- `npm run build`: intentionally BLOCKED with `wardrobe_staging_identity_invalid` in the unconfigured local environment. It does not silently produce a Production-connected artifact. The synthetic offline build above is the positive build verification.
- `npx vitest run --config vitest.wardrobe.config.js --silent --reporter=json --outputFile=.tmp/wardrobe-api-results.json`: 728 tests, **727 passed, 1 failed**. The failure is `paymentProviderFoundation.test.js` → `activates only the checkout intent user and plan, then replays safely`: paid assignment expected, free returned. Reproduced with original source from baseline `3dbc671` using only memory fixtures and a separate config, since baseline Vite itself had a regex syntax error. No billing logic was changed to mask the existing failure.
- The client offline test initially used an already cached module; clearing the module cache before importing fixed the fixture. Final test proves no Supabase client construction, even with inherited credentials.
- Final targeted run after hardening the direct cost-RPC boundary and testing all seven internal HTTP handlers directly: `npx vitest run --config vitest.wardrobe.config.js api/_shared/wardrobeStagingGuard.test.js api/_shared/wardrobeApiIsolation.test.js api/_shared/aiHelp/supabaseCostStore.test.js src/services/supabaseClient.wardrobe.test.js --silent --reporter=dot`: **81/81 passed**. The six negative builds and positive bundle scan were rerun after the cost-RPC change and passed.
- `npx playwright test --config playwright.wardrobe.config.js`: PASS against built local HTTPS artifact. Image consent, local save, outfit, reload, deletion and 390/320 px layout work. Zero API requests and zero external requests; deliberate external probe was rejected by CSP before network interception.
- `npm run lint -- --format json --output-file .tmp/wardrobe-eslint.json`: 50 errors and 9 warnings, as before the sprint. Two pre-existing unused declarations are in the modified object-bank API; they were not introduced or suppressed by the guard. No new lint diagnostics.

Tests and build fixtures are synthetic and stored only in process memory or Git-ignored `.tmp/`; no real key/session is written. Build products, test traces, baseline copy and JSON results are not committed. The versioned inventory contains only source paths, line numbers, operations and existing route mappings.

The previous untracked `docs/PREVIEW_SECURITY_RESPONSE_2026-10-20.md` is unrelated and deliberately left untouched/uncommitted.
