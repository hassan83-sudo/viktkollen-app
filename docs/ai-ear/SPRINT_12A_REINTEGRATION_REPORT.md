# SPRINT 12A — AI-örat: re-integration of three legacy features

Date 2026-09-20. **No production deploy, no Cloud Run change, no push.** Work is committed on the local branch `sprint-12a-ai-ear-reintegration`, created from `main` (`c8899a5`, preserved). Nothing was merged from `ai-ear-sprint4/6/7`; their code was read with `git show` and re-implemented selectively on top of today's main.

## Result per feature
| Feature | Provider | Status |
| --- | --- | --- |
| Identifiera musik | AudD | **CONFIG REQUIRED** — `AUDD_API_TOKEN` is not set (Vercel or local) |
| Nynna / vissla / sjung | ACRCloud Humming | **CONFIG REQUIRED** — `ACRCLOUD_HOST`, `ACRCLOUD_ACCESS_KEY`, `ACRCLOUD_ACCESS_SECRET` are not set |
| Ord ur en låt | OpenAI speech-to-text | **READY** — uses the existing `OPENAI_API_KEY`; the historical model `gpt-transcribe` was verified valid (`GET /v1/models/gpt-transcribe` → 200) and a real transcription through the re-integrated code returned text for a public speech fixture |

Not-configured features are **hidden** in the UI (a small authenticated route `api/ai-ear-providers` reports three booleans), so nothing is shown that cannot work. Server routes also answer `503 PROVIDER_NOT_CONFIGURED`, which the UI words per feature.

## What was reused from the legacy branches (read via git show)
* **Sprint 4 `a35271c`** (`api/ai-ear-music-recognition`, `musicRecognitionProvider.js`): AudD endpoint/params, `AUDD_API_TOKEN`, no-match = `result: null`, result contract `{matched, result:{title, artist, details:{album, provider, releaseYear}}}`, consent purpose `audio-music-recognition`, texts from the old consent dialog.
* **Sprint 6 `8a3d604`** (`api/ai-ear-humming-recognition`, `hummingRecognitionProvider.js`): ACRCloud Identify endpoint `/v1/identify`, HMAC-SHA1 signature over `POST\n/v1/identify\n<key>\naudio\n1\n<timestamp>`, status `1001` = no match, `3001/3014` = our credentials wrong, results from `metadata.humming`, up to two alternatives, purpose `audio-humming-recognition`.
* **Sprint 7 `bb24648`** (`api/ai-ear-lyrics-transcription`, `lyricsTranscriptionProvider.js`): `POST /v1/audio/transcriptions`, model `gpt-transcribe` (env override `AI_EAR_LYRICS_MODEL`), `response_format json`, `{transcript, noSpeech, language}`, purpose `audio-lyrics-transcription`, transcript never logged.
* Wire contract kept: multipart with one `audio` file, Supabase bearer, consent token header, fixed error envelope.
* **Not** reused: `lyricsSearchProvider.js` (placeholder), the old standalone `AiEarSection` UI, vehicles/"not-connected" stubs, the old provider slots/dispatcher.

## What was adapted (and why)
* **One shared server skeleton** (`api/_shared/aiEarProviderRoute.js`) instead of three copies of the multipart parser: streamed size limit, client-abort safe, config check before the body is read, provider-isolated.
* **Consent-token label bug in the legacy code:** the old routes verified the consent token with label `audio` while the old client hashed the blob with the default label `image`, so verification could never succeed. The new client hashes with label `audio` (`images: [{label:'audio', source: wav}]`).
* **Audio pipeline:** the new features reuse today's on-device conversion (mono 16-bit WAV, ≤ 12 s, ≤ 32 kHz) instead of raw MediaRecorder blobs; server caps lowered to 4 MB (Vercel body limit). Old recording UI code was **not** restored; today's `AiEarMode` recording (already built from the same MediaRecorder/timer/cleanup ideas) is reused.
* **ACRCloud host is validated** as a hostname before a URL is built from it; provider **scores are never passed to the UI** (no percentages, no confidence claims).
* Function `maxDuration` 30 s added to `vercel.json` for the three new routes (provider timeout 15 s + cold start margin); `.vercelignore` excludes `*.testkit.js`.

## New / changed files
New: `api/_shared/aiEarProviderRoute.js` (+`.testkit.js`), `api/ai-ear-music-recognition/`, `api/ai-ear-humming-recognition/`, `api/ai-ear-lyrics-transcription/`, `api/ai-ear-providers/` (each with `index.test.js`), `src/services/aiEarProviders.js` (+test), `src/features/ai-ear/AiEarModeProviders.test.jsx`, `src/features/ai-ear/aiEarProvidersHygiene.test.js`.
Changed (small): `AiEarMode.jsx`/`.css` (mode chips, per-mode copy, result blocks), `aiEarViewModel.js` (music/humming/transcript views, per-feature error wording), `analysisConsent.js` + `analysisConsentProof.js` (3 purposes), `aiRateLimiter.js` (3 routes), `privacyLayers.js` (card now says which modes use an external service), `.env.example` (names only), `vercel.json`, `.vercelignore`.
**Unchanged:** `api/ai-ear/interpret`, `googleIdToken`, `aiEarAudio.js`, `aiEarInterpret.js`, Cloud Run backend, Perch/YAMNet, router 10v.0, adapter 10za.0, Hem layout, no vehicles, no Arabic-music section.

## UI
Today's AI Örat is kept as the default mode "Fåglar & ljud" and extended with chips **Identifiera musik**, **Nynna / vissla / sjung**, **Ord ur en låt** (shown only when configured). Each mode names its external provider before sending, has its own explicit send button (= consent), retry, cancel, loading and feature-specific "temporarily unavailable" text ("Fågel- och ljudanalysen påverkas inte"). Results show only fields the provider returned; music/melody results carry "kommer från en extern tjänst och kan vara fel"; the transcript is shown as a quote and stated as not stored.

## Privacy / provider isolation
Audio and transcript are memory-only per request, no storage/DB/analytics; server logs carry request id, byte counts, codes and transcript **length** only (tested). Each route calls only its own provider (source-scan test); a provider failure returns its own error and cannot affect another provider or the Perch/YAMNet route (tested in the UI: a failing music provider leaves bird analysis working).

## Tests / build / security
* New tests: 5 route suites (each incl. the shared 11-case behaviour matrix: method, multipart, auth, consent bound to bytes+purpose, invalid/empty/oversized/abort, not-configured, rate limit, provider 5xx/network/timeout, malformed response, no secret leakage) plus provider-specific cases (AudD success/no-match/error status; ACRCloud signature, multiple candidates, no match, 3001/3014, host validation; OpenAI success/empty/401/429, transcript never logged), client provider tests (3 features × 5 behaviours + status), UI tests (modes, per-mode consent text, results, isolation, retry, cancel, storage), hygiene scan. **+93 passing tests** (3382 → 3475).
* Whole suite: **56 failing = the same 56 pre-existing unrelated failures as before (0 new)**. ESLint clean on all touched/new files, `npm run build` passes, i18n checks pass.
* Regression of today's AI-örat: all earlier AI-örat tests (bird, speech/music/whistle context, unresolved, insufficient signal, invalid audio, loading, retry, cancel, unmount) still pass unchanged.
* **Security scan** of `dist/` (100 files): 0 matches for `AUDD_API_TOKEN`, `ACRCLOUD_*`, `OPENAI_API_KEY` (name and actual value), private-key text, service-account fields, provider hosts, `ANALYSIS_CONSENT_SECRET`, hard-coded Bearer values. Source scan: no provider secret in `src/` (only pre-existing server-side references elsewhere).
* Mobile (headless Chromium, mocked provider results): 390 / 430 / 1280 px, 6 states each, **0 px horizontal overflow**, touch targets ≥ 44 px on touch widths, 0 console errors.
* Real provider calls made: only one OpenAI transcription of a public test clip (to validate the model/contract). AudD and ACRCloud were **not** called (no credentials); their integrations are covered by mocks and the historical contract.

## Ready for E2E / still off
* Ready once configured: set (Vercel, server-only) `AUDD_API_TOKEN` for Musik; `ACRCLOUD_HOST` + `ACRCLOUD_ACCESS_KEY` + `ACRCLOUD_ACCESS_SECRET` for melody (an ACRCloud AVR project with the Cover-Song/Humming engine enabled). Speech-to-text needs nothing new but has not been E2E-tested through the UI/Vercel.
* Not deployed: production still serves the c8899a5 AI-örat only. To ship: push the branch/merge to `main` (auto-deploys), then run an E2E per feature with a test login.
* Env names only, no values, appear in this report.
