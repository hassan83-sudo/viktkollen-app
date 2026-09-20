# SPRINT_11A_REPORT — Viktkollen AI-örat production-backend integration

Date 2026-09-20. Backend (Cloud Run `perch-inference-rc10ze-1` = 100 %, rollback `perch-inference-00010-wmj`) **not touched**; re-checked read-only at the end (generation 14, unchanged). No deploy, no Vercel/Supabase/Google/IAM/secret change, no commit.

## Decision: B) INTEGRATION PARTIAL — one specific prerequisite remains
The integration code, UI, tests and docs are done, but the secure hop **cannot run in production** until a human provisions its Google credential (service account with `run.invoker` on the private service) and the Vercel server env. That needs an IAM change and secrets, which this sprint was told not to make. Because of that, real end-to-end (app → hop → Cloud Run) is unproven, so I did not mark A and did not write the 11B plan; the checklist in `AI_EAR_AUTH_ARCHITECTURE_11A.md` is the exact to-do.

## Important deviation from the brief
The brief assumed an existing AI-örat UI/mock. **None existed** (only the camera-based "AI Ögat"/Smart kamera hub). 11A therefore added a minimal new Smart-kamera mode "AI Örat" (👂) behind the new feature flag `aiEar` (default **off**, hidden from the hub, no other mode changes). Details: `AI_EAR_INTEGRATION_INVENTORY_11A.md`.

## What was built
* **Server hop** `api/ai-ear/interpret` (Vercel function): origin check, server switch `AI_EAR_ENABLED`, Supabase auth, rate limit, streamed size limit (4 MB), WAV signature check, HMAC consent token bound to the exact audio (new purpose `ai-ear-interpret`), Google ID token (`api/_shared/googleIdToken.js`, service-account JWT with `target_audience`, no new dependency), call to `/v2/interpret`, response reduced to state/disposition/species/copy/signal metadata (no raw evidence, scores, timing, hashes), generic errors.
* **Client**: record (max 12 s) or choose a file → converted on the device to a small mono 16-bit WAV (backend cannot decode WebM/MP4) → explicit "Analysera ljudet" tap → hop → result. States: bird lead/caveat, speech (no transcription), music, whistle, mixed scene, unresolved, insufficient signal (with tips), unavailable; loading/cold-start UX, single-flight, cancel, timeout, retry, unmount safety, friendly error mapping.
* No thresholds or score logic in the frontend; species shown only when the backend disposition allows.
* Small changes to shared code: feature flag, hub mode, consent purpose (server + client), rate-limit route, `.env.example` placeholders.

## Verification (details in `AI_EAR_TEST_RESULTS_11A.md`)
* 87 new tests green (hop 20, Google token 4, view model 14, UI 24, integration/hygiene 6, audio 9, client 10). Whole suite: 0 new failures vs baseline (57 pre-existing failures unrelated, 3373 passed). ESLint clean on 11A files; build, `i18n:check`, `i18n:hardcoded` pass.
* Real-backend format check (synthetic, read-only): client-made WAVs for 2 birds, speech and music returned the same state/disposition/top candidate as the 10Z-F reference.
* Layout at 390 / 430 / desktop in a temporary harness: no horizontal overflow, 44 px touch targets. **Not** verified inside the real logged-in app.
* Security review (`AI_EAR_SECURITY_REVIEW_11A.md`): 0 findings (no keys/tokens in client or repo, no Authorization/audio logging, no unsafe VITE env, no audio persistence).

## Prerequisites and open items (human)
1. Service account + `roles/run.invoker` on `perch-inference` (IAM change), key or Workload Identity Federation.
2. Vercel server env: `AI_EAR_GCP_SERVICE_ACCOUNT_JSON`, `AI_EAR_BACKEND_URL`, `AI_EAR_ENABLED=true`; confirm `ANALYSIS_CONSENT_SECRET`.
3. Confirm Vercel function max duration (cold start ~8 s; hop timeout 28 s) and body limit.
4. Preview deploy + real-device E2E (mic, iOS Safari, Android Chrome), then decide on enabling the flag.
5. Unchanged: product decisions PD-1..PD-5 (lead shows up to 5 species lines by backend default), legal YELLOW, HIGH-CVE decision, privacy-policy wording for sending audio.

## Repo state
Uncommitted changes in the working tree (7 modified files, new `api/ai-ear/`, `api/_shared/googleIdToken*`, `src/features/ai-ear/`, `src/services/aiEar*`, `docs/ai-ear/`). Production frontend enabled: **NO**.
