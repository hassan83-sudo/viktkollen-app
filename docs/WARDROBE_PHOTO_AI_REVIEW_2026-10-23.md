# Manual wardrobe photography with mandatory AI image review

Base: feature/ai-eye-wardrobe-link-20261022 at 2e4969d.
Implementation branch: feature/wardrobe-photo-ai-review-20261023.
No merge to main or Production deployment is authorized by this work.

## Final Preview verification — 2026-10-25

Verified application commit: `b2036410da9539e4e1bab6231525193ef6381835`.
Ready deployment: `dpl_97M4MTyKFMqsMyGSfB4brAM9C2o4`.
Preview: https://viktkollen-qecjppwzd-appsonthego-s-projects.vercel.app/

The original build failure was `wardrobe_source_identity_invalid`. Real build
diagnostics showed Vercel's synthetic local Git branch was `master`, although
the provider metadata identified this exact feature branch. Confirmed Vercel
Preview builds now use the provider source ref; local conflicting checkouts
remain rejected. Exact environment/branch/project/key-role/budget gates remain.
No project-wide build/env setting or Deployment Protection rule was changed.

All nine dedicated env entries exist only on this Preview branch. Public
configuration was read and checked; server Secrets stayed write-only. The real
authenticated flow and three reservations in the dedicated Staging database
confirmed the runtime server connection. The deployed HTML restricts connect-src
to self plus Staging. All five first-party JS assets were inspected: no
Production project ref, actual sb_secret_ key, OpenAI key or service-role JWT
was found. Supabase's SDK contains a literal sb_secret_ format check, not a key.

Changes in this continuation:
- AI photo categories are clothes/shoes only; Accessoar/Annat are rejected by
  the review validator. Existing manual/legacy wardrobe categories are retained.
- Saved garments can be edited (name/category/color) without replacing their
  image, identity, outfit links or history.
- One obsolete test assertion was scoped to the garment group instead of
  accidentally counting the form's newer consent checkboxes.

Actual authenticated browser → Preview → Staging/OpenAI results:
1. A standalone black t-shirt photo was approved with name, category and color.
   The user-facing fields were editable; the corrected name and approved image
   were saved via Save and photograph next. Its next native file chooser opened.
2. A public photo containing a person's torso/arms was rejected as person/body
   part. The photo preview was removed and no garment/image was saved.
3. The app's existing food illustration was rejected as not clothing. It was
   removed from the form and was not saved. This used the wardrobe endpoint,
   not the meal scanner.
4. A manual garment without an image was saved, both garments selected on the
   2D mannequin, an outfit saved, and saved metadata edited. Garments, selection
   and outfit survived reload. Consent checkboxes reset after reload.
5. Server logs show exactly three remote starts and three completions with
   gpt-4.1-mini. Staging holds exactly three reservations of 0.20 SEK: 0.60 SEK
   reserved of the unchanged 1 SEK cap, including the two rejected images.
   Reload caused no additional reservation. No budget row/reservation was reset
   or refunded. At most two further 0.20 SEK reservations remain.

This is a reserved upper bound, NOT measured invoiced API spend. Existing
telemetry labels monetary cost UNAVAILABLE; no actual OpenAI charge is claimed.
Prior approved budget SQL/limit tests were reused, not repeated or described as
a new multi-session load test. Technical-failure image discard remains covered
by the existing approved form tests; no paid failure was deliberately induced.

Local verification after relevant changes: 35 unique targeted tests passed
(build identity, review validator, server wardrobe mode and wardrobe UI).
Synthetic build and bundle audit passed after build/UI changes. Targeted lint
passed on clean changed files; the two pre-existing unused declarations in the
legacy object endpoint remain. The original 71-test suite was not rerun wholesale.

Browser layout at 457 CSS pixels has scrollWidth equal to viewport width.
Native file-picker reopening and real file uploads were verified in the desktop
in-app browser. No real iPhone Safari/PWA or Android Chrome camera was available:
hardware capture, HEIC behavior and device-specific save-next remain unverified.
The file-input approach does not retain a JavaScript MediaStream; the existing
photo pipeline revokes object URLs and aborts/ignores late analysis on unmount.

Two clearly named local test garments and `Staging-testoutfit` remain in this
browser profile as demonstrators. Only one garment has an approved image. No
earlier wardrobe data existed in this test profile; no other data was removed.
Screenshots are local, ignored artifacts under `.verification.local/`.

### Remaining manual phone test (separate release approval still required)

Open the Preview on the actual phone, sign in with the approved Staging test
account, approve local/remote photo consent, and use Ta bild med kameran for one
garment without hands/people. Check preview/loading and editable suggestions;
use Spara och fota nästa, capture the second garment, then save and select them.
Only two AI reservations remain globally; a rejected/error response still uses
its reservation. Stop when budget is exhausted; do not raise/reset it.
Phone/browser storage is separate from this desktop profile and is not synced.

Wardrobe filming/video recognition is not implemented. The wardrobe uses single
manually selected photos; other existing live-camera previews do not implement
wardrobe opening/closing recognition. No new video, door animation or AI service
was added. Approval remains probabilistic, not a guarantee for every future image.

## Implemented

- User photographs/selects one garment or shoe pair at a time.
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

## Dedicated Preview configuration (installed; see verification above)

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

- Real iPhone Safari/PWA and Android Chrome hardware-camera/save-next verification.
- Actual provider invoiced spend is unavailable; reservations are not actual spend.
- Separate user approval before merge or Production release.
- This change covers wardrobe only, not food/body/other AI Eye modes.
