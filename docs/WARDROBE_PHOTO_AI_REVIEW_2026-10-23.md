# Manual wardrobe photography with mandatory AI image review

Base: feature/ai-eye-wardrobe-link-20261022 at 2e4969d.
Implementation branch: feature/wardrobe-photo-ai-review-20261023.
No merge to main or Production deployment is authorized by this work.

## Implemented

- User photographs/selects one garment, shoe pair or accessory at a time.
- Explicit session-scoped remote and local consent precede analysis/storage.
- AI analysis runs after image selection if remote consent is already checked.
- The existing object-bank endpoint accepts a separate wardrobe mode; its existing object-bank contract is preserved.
- Wardrobe results must explicitly assert a single item, no person, valid garment category, short name and color. Missing, contradictory or malformed fields reject the image.
- Prompt rejects people, body parts including hands, reflections, multiple garments, other objects and uncertainty. Plain bed/hanger/table/floor backgrounds are allowed. Model detection is probabilistic, not a guarantee.
- Rejection or provider failure discards the in-memory picture. Manual text-only registration remains available.
- Only a reviewed picture may be saved by the form; there is no server image storage. Local browser storage is not a security boundary against a user manually editing their own browser data.
- Save and photograph next reopens the camera input from the user's click. Real device behavior remains unverified.
- Separate Staging-only surface with login, wardrobe and restricted CSP. Only consent and object-bank routes are opened; the object route only accepts wardrobe mode in this Preview.
- Dedicated atomic Staging budget RPC and private tables; no effect on AI Help or Coach budgets. Each dispatch retains its full configured per-call ceiling, including timeouts/rejections/errors. No automatic reset/refund.
- The Preview budget cannot exceed 1 SEK. The per-call ceiling MUST be verified for gpt-4.1-mini, low-detail image, the fixed prompt and maximum 350 output tokens before PRICE_VERIFIED is set. No production cost catalog is changed.

## Dedicated Preview configuration (not currently installed)

Scope all values to the implementation branch, Preview only:

| Variable | Requirement |
| --- | --- |
| WARDROBE_AI_PREVIEW | true |
| WARDROBE_AI_SUPABASE_URL | https://armtslzspuebmlysnooq.supabase.co |
| WARDROBE_AI_ANON_KEY | Staging anon JWT with matching project ref; public Config |
| WARDROBE_AI_SERVICE_ROLE_KEY | Staging service_role JWT with matching project ref; Secret |
| WARDROBE_AI_OPENAI_API_KEY | Dedicated non-Production provider key; Secret |
| WARDROBE_AI_CONSENT_SECRET | New random secret, at least 32 characters; Secret |
| WARDROBE_AI_BUDGET_SEK | Positive, at most 1 |
| WARDROBE_AI_MAX_CALL_SEK | Verified conservative per-call ceiling, positive and no larger than budget |
| WARDROBE_AI_PRICE_VERIFIED | true only after ceiling calibration |

VERCEL_ENV=preview and VERCEL_GIT_COMMIT_REF must identify the exact implementation branch. Missing/mismatched values stop the build and API. Inherited Production variables do not satisfy this configuration. Opaque Supabase keys are deliberately unsupported until their project identity can be verified separately.

## Verified

- 71 focused tests passed across form, review validation, endpoint mode, consent/auth and isolation. The budget test uses PGlite to execute the actual migration, verifies excess-call denial and denies anon execution.
- New/otherwise clean changed files pass ESLint. Three pre-existing unused declarations remain in object-bank-scan/index.js and objectBankScan.js; no new lint failures.
- Synthetic dedicated-Staging Vite build passed. Bundle contains neither synthetic server secrets nor inherited Production sentinel values; CSP restricts connections to self and the Staging project.
- Migration applied ONLY to armtslzspuebmlysnooq. Real service_role SQL reservation probe hit the budget limit on its second reservation and was rolled back, leaving no test budget/calls.
- Security advisor: private budget tables intentionally have RLS with no public policies and service_role-only privileges. No public access was added.

## Remaining

- Install dedicated branch Preview config/Secrets; they cannot be copied from unreadable Vercel Secrets on other branches.
- Verify the per-call upper bound before enabling paid calls.
- Ready Vercel Preview, real AI review and phone camera/save-next verification are NOT completed.
- A Chromium executable is unavailable in the current workspace; no new browser/device result is claimed.
- This change covers wardrobe only, not food/body/other AI Eye modes.
