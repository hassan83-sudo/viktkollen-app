# AI-örat — integration inventory (Sprint 11A)

Backend (frozen, not touched): Cloud Run `perch-inference` (project `perch-bird-poc`, `europe-west1`), revision `perch-inference-rc10ze-1` = 100 %, rollback `perch-inference-00010-wmj`, router 10v.0, adapter 10za.0. Handoff: `perch-validation/sprint10zi/BACKEND_HANDOFF_TO_VIKTKOLLEN.md`.

## Finding that changes the premise
**No AI-örat UI, mock analysis, audio recording or bird-recognition flow existed in Viktkollen.** A search of `src/`, `api/`, `docs/`, `tests/` (terms: örat/ögat, bird/fågel, perch, ljud, MediaRecorder, getUserMedia) found only:
* "AI Ögat" = the **Smart kamera** hub (camera modes; `src/features/smart-camera/`), plus the ready-place tile `readyPlaceResources.js` ("AI Ögat är förberett … ingen mockanalys visas som riktig AI").
* Unrelated audio code: place voice call, walkie, ambient sound (social), realtime voice coach.
There was therefore nothing to "reuse"; 11A adds one minimal new Smart-kamera mode, behind a flag that is OFF by default.

## Existing structure that was reused
| Area | Files | How it was used |
| --- | --- | --- |
| Hub / modes | `src/features/smart-camera/smartCameraModes.js`, `components/SmartCameraHub.jsx`, `SmartCameraStage.jsx`, `SmartCameraModeViews.jsx` | new mode `ai-ear` (👂 "AI Örat"), `needs: ['aiEar']` so it is hidden unless the flag is on |
| Feature flags | `src/features/featureRegistry.js` (`defaultFeatureFlags`, localStorage override `viktkollen.features.v1`) | new flag `aiEar: false` |
| Server routes | Vercel functions `api/<name>/index.js` (Node) | new `api/ai-ear/interpret/index.js` |
| Auth | `api/_shared/verifySupabaseUser.js` (Supabase bearer) ; client `src/services/ai/aiAuthTransport.js` | same pattern as forgotten-items / nutrition-photo routes |
| Consent proof | `api/_shared/analysisConsent.js` + `src/services/security/analysisConsentProof.js` + `api/analysis-consent` | added purpose `ai-ear-interpret` (HMAC token bound to the exact audio bytes, user, purpose) |
| Rate limit | `api/_shared/aiRateLimiter.js` | added route `aiEar` (default 10 / 10 min / user) |
| Errors | `api/_shared/aiRouteErrors.js` | same safe error envelope |
| Static hardening test | `smartCameraSecurity.test.jsx` scans smart-camera files for `fetch(`/`MediaRecorder`/`FormData` | all recording/upload code lives OUTSIDE those files (`src/features/ai-ear/`, `src/services/`) |

## Current-state facts relevant to the design
* Frontend = Vite + React 19 SPA; server = Vercel serverless functions in `/api`; DB/auth = Supabase. i18n exists (`src/i18n`) but the whole Smart-kamera area uses hard-coded Swedish; the new mode follows that (i18n and hardcoded-UI checks pass).
* Nothing in the repo referenced Google Cloud credentials or Cloud Run before 11A (`grep GOOGLE|gcloud|service.account` = 0 hits in docs/README/DEPLOYMENT). No Vercel/Supabase/Google auth to Cloud Run existed.
* App is auth-gated (Supabase login); feature flags are per-browser (localStorage), not per-user server config.

## Files added / changed (11A)
Added: `api/ai-ear/interpret/index.js` (+test), `api/_shared/googleIdToken.js` (+test), `src/features/ai-ear/{AiEarMode.jsx, AiEarMode.css, aiEarViewModel.js, fixtures/backendFixtures.js}` (+3 tests), `src/services/aiEarAudio.js` (+test), `src/services/aiEarInterpret.js` (+test), `docs/ai-ear/*`.
Changed (small): `featureRegistry.js` (+flag), `smartCameraModes.js` (+mode), `SmartCameraModeViews.jsx` (+import/render), `analysisConsent.js` and `analysisConsentProof.js` (+purpose), `aiRateLimiter.js` (+route), `.env.example` (+server-only placeholders).
Not changed: backend, `vercel.json`, Vercel/Supabase/Google config, any secret, any other feature.
