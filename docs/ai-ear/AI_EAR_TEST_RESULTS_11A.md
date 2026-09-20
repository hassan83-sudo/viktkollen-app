# AI-örat — test results (Sprint 11A)

Run 2026-09-20 on the local checkout (no Vercel deploy, no preview).

## New tests (all green)
| Suite | Tests | Covers |
| --- | --- | --- |
| `api/ai-ear/interpret/index.test.js` | 20 | valid audio → reduced result; Google ID-token call + Cloud Run call shape; no raw evidence/scores/timing in response; species withheld for non-bird states; POST only; server switch off (503, no network); Supabase auth required; wrong origin; non-WAV type/bytes; 413 (streamed limit); consent token missing/wrong audio; backend 400 / 413 / 5xx / timeout / 401-403; missing Google credential; Google refusal; malformed backend response; rate limit; token caching; no secret/token/audio/filename in logs or responses |
| `api/_shared/googleIdToken.test.js` | 4 | RS256 assertion verifies against the public key, claims, credential parsing, caching/refresh, no key/error-body leakage |
| `src/features/ai-ear/aiEarViewModel.test.js` | 14 | every state with real contract fixtures through the hop reducer; species rules; unknown state; no score wording; error mapping without Google/IAM terms |
| `src/features/ai-ear/AiEarMode.test.jsx` | 24 | idle (no mic/network), explicit consent tap, loading + double-submit guard, bird / speech / music / whistle / unresolved / insufficient signal / unavailable, oversized and non-audio file, decode error, network error + retry, timeout/service/too-large/invalid/auth copy, cancel, unmount abort with no state update, microphone record/stop/track release, mic denied, no storage writes |
| `src/features/ai-ear/aiEarIntegration.test.js` | 6 | flag off by default and hub unchanged; flag on adds only the new mode; no Google/VITE/storage/console in client code; server logging hygiene; `.env.example` placeholders |
| `src/services/aiEarAudio.test.js` | 9 | WAV header/clamping, downmix, resample, 12 s / 32 kHz limits, decoder wrapper |
| `src/services/aiEarInterpret.test.js` | 10 | no network without approval, request shape (own hop only), auth, stale user, HTTP→reason mapping, malformed payload, network error, abort, timeout, no secrets in results |

## Whole suite (baseline comparison)
`npm test`: after 11A **57 failed / 3373 passed**; with the 11A changes to tracked files stashed **80 failed / 3350 passed** (the 23 extra are 11A's own new tests, which cannot pass without the 11A changes). **0 new failures** vs baseline; the 57 remaining failures are pre-existing and unrelated (service worker/PWA, app shell, nutrition photo, place/ready sections, social, Vite dev config, …). Existing Smart-camera suites (`smartCameraSecurity`, `SmartCameraHub`, `ForgottenItemsCheck`) pass, including the static "no fetch/MediaRecorder/FormData in smart-camera files" scan.

## Lint / build / checks
* ESLint on all 11A files: clean. Whole-repo `npm run lint`: ~790 pre-existing errors (not touched, not part of 11A).
* `npm run build`: passes. `npm run i18n:check`: passes. `npm run i18n:hardcoded`: 0 signals.

## Real-backend compatibility check (synthetic, read-only, through the production service URL)
The client's own WAV conversion (`channelsToWav`, 32 kHz mono 16-bit) was applied to 4 real fixtures (2 birds, 1 speech, 1 music) and posted with a Google ID token: all HTTP 200 with the same state/disposition/top candidate as the 10Z-F reference (bird lead, bird lead, speech withhold, music withhold). Proves the format the app will send is accepted by the frozen backend.

## Layout (headless Chromium, temporary harness, since deleted)
Widths 390, 430, 1280; 12 result/error states each: **0 px horizontal overflow** everywhere; buttons >= 44 px on touch widths; screenshot reviewed. Real app flows (login → Smart kamera) were **not** exercised: the app is auth-gated and no test account/config was used.

## Not tested (needs the prerequisites in the auth doc)
Real hop → Google token → Cloud Run in Vercel; real microphone/`MediaRecorder` in a browser (recorder is faked in tests); Vercel duration/body limits; Safari MP4 decode path.
