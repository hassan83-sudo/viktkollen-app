# Final review — sprint #65

2026-10-22. Reviewed branch only: `feature/ai-eye-wardrobe-link-20261022`.

## Verdict: GO for a separately authorized push; no live-environment approval

The two submitted commits are `9fd9bd86fbe518d164b0edb8bca292a0a070adef` and `11e152730f200dce0288acc2ebea6b757f9addaa`. They change **50 files**, not 30: 48 implementation/configuration/test files plus two documentation/inventory files. Both commits and all those categories were reviewed, including the complete 12 physical API handlers, shared network transports, auth/admin clients, client initialization, build policy, fixtures, inventory and runbook. The inventory still exactly matches current source: 12 functions, 31 rewrites and 51 external-call sites.

GO means the guarded code can be pushed after explicit human authorization. It does **not** mean the current remote Preview is isolated or that a new deployment will be READY. No push or deployment was performed during review. No Vercel environment setting, global service-role credential, real database, payment system, main or other branch was changed.

## Findings corrected locally

1. Build-command provenance was not guaranteed by the repository. `vercel.json` now explicitly selects `npm run build` and output `dist`; `package.json` runs `vite build`. This prevents an inherited dashboard build command from skipping the Vite guard or publishing another output directory. Vercel documents repository `buildCommand` precedence in [Static Configuration](https://vercel.com/docs/project-configuration/vercel-json). Tests assert the chain and absence of legacy `builds` overrides.
2. The strict source-branch check prevented existing accessibility/support browser fixtures from starting, especially under detached CI checkouts. Their local configs now opt into an explicit fixture exception with only `http://127.0.0.1:54321` and recognized synthetic public keys. No real key or backend is accepted. Their marker also forces server API denial even if the shell has unrelated development metadata or inherited credentials. The generic `--mode test` development-server exception was removed; the unit-test exception also requires Vitest's process marker. Real builds never receive an exception.
3. Offline page CSP previously permitted workers, whose script responses need their own network policy. It now uses `worker-src 'none'`. The built browser test asserts this along with `connect-src 'self'`.

## Safety of an automatic Git Preview build

- Repository-controlled Vite build fails before artifact generation on missing/wrong source identity, provider markers, dedicated Staging configuration, public/server key separation or exact offline/AI-disabled flags. A successful build can contain only the minimal local wardrobe entry and explicitly permitted public configuration. Inherited Production URL/key and server-secret canaries were absent from the emitted client files.
- Every API handler denies with `503 WARDROBE_STAGING_API_DISABLED` before request/auth/body access; aliases cannot select another dispatch path. Missing runtime markers also deny. Supabase factories, auth verification, AI gateways, Google/provider transport, cost RPCs and SumUp dispatch have additional guards. These were exercised with network/auth/DB traps and direct internal handler calls.
- A valid offline client creates no Supabase client, offers no login/AI action and uses CSP to block external network connections and workers. Only local image consent/storage and local camera functionality remain.
- The current Vercel project reports Vite as its framework. Read-only deployment metadata shows Production on `main` and the existing wardrobe deployment as a Preview. Neither GitHub workflow contains a deployment, real credential, migration or live provider step; the push workflow runs local tests/i18n checks only.
- Without the seven dedicated branch values, a Git-triggered build is expected to fail. It must not fall back to a Production-connected client. Existing immutable deployments are not modified or repaired by a failed build; do not test against those old URLs or cached aliases.
- The build pins and guards assume the reviewed Git integration/configuration is used. A later operator change to the repository, project root or deployment mechanism needs a new review. Prebuilt/manual deployments, merges and environment changes are not approved by this GO.

## Executed checks

| Command / scope | Actual result |
| --- | --- |
| `npx vitest run --config vitest.wardrobe.config.js --silent --reporter=json --outputFile=.tmp/wardrobe-final-review-tests.json` | 737 tests: 736 pass, 1 known baseline payment-fixture failure. Same failure was previously reproduced on unchanged `3dbc671` using memory-only fixtures. |
| Targeted four isolation/auth/cost suites, after the final fixture correction | 83/83 pass. Covers all 12 physical handlers, 31 aliases, seven internal handlers and denied direct provider/DB clients. |
| `node scripts/verifyWardrobeOfflineBuild.mjs` | Six negative real builds rejected; positive synthetic offline build passed. Ten public text files scanned without inherited Production configuration or server canaries. |
| `npm run build` without dedicated configuration | Vite fails with `wardrobe_staging_identity_invalid`, as required. |
| `npx playwright test --config playwright.wardrobe.config.js` | 1/1 pass. Built offline artifact: local photo/outfit/reload/deletion and 320/390 px layout. Zero API/external requests; intentional external probe blocked before network. |
| `npx playwright test --config playwright.a11y.config.js tests/a11y/wardrobe.spec.js` | 1/1 pass against the existing mock app fixture, using local port 5193. |
| `npx playwright test --config playwright.ai-help.config.js tests/ai-help/support-launch.spec.js` | 4/4 pass: free/paid/admin support and language switching, all mocked. |
| `npm run lint -- --format json --output-file .tmp/wardrobe-final-review-eslint.json` | Existing 50 errors/9 warnings, no increase. Targeted ESLint on final review corrections passes without diagnostics. |
| `npm run i18n:check`; `npm run i18n:hardcoded` | Both pass; hardcoded-text checker reports its existing 16 signals in four unrelated files. |
| `git diff --check` | Pass. |

Chrome was used through `A11Y_CHROMIUM_EXECUTABLE` for local browser tests. No real Auth session, AI request, payment, mail or remote database write was used. Unit tests use in-memory database fixtures, with real fetch disabled in the offline regression configuration. This report does not claim that full GitHub CI or a new remote Preview ran.

## Still gated

The [runbook](WARDROBE_OFFLINE_ISOLATION_RUNBOOK.md) names the seven future variables with exact Preview+branch scope, public/secret classification and Staging origin. Those names match the guard. Opaque key project ownership cannot be proven offline; the operator must verify it securely before any live use. No global `SUPABASE_SERVICE_ROLE_KEY` may be edited or removed.

Remote Preview acceptance, secret configuration, any deployment and paid AI remain separately gated. The monetary cap for live image recognition remains unverified; the offline solution avoids that cost path entirely. Global lint debt and the baseline payment-fixture failure remain visible, so this is not a claim that the complete repository/CI is green.
