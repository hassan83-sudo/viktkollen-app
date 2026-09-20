# AI-örat — E2E results (Sprint 11B)

## What "real" means here (be exact)
Run 2026-09-20 on a **local rig** (temporary files, since deleted): real Vite-served React UI (the real `SmartCameraStage` → hub button "AI Örat" → real `AiEarMode`), real client code (`aiEarAudio`, `aiEarInterpret`, consent flow against the real `api/analysis-consent` handler), the **real hop handler `api/ai-ear/interpret`**, **real Google ID-token minting with the dedicated service account**, and the **real private production Cloud Run `perch-inference-rc10ze-1`** (`/v2/interpret`). Headless Chromium with a fake microphone device for recording.
Only substitutions: (1) the Supabase login (no test account exists) — the rig accepts one fixed local test token on the server and stubs the session lookup in the browser; (2) the hop ran in a local Node process instead of Vercel (Vercel access was not available). So this proves the app ↔ hop ↔ Google auth ↔ private Cloud Run chain and UI semantics, **not** Vercel deployment, Supabase login, or a physical phone.

## Semantic cases (fixtures from the frozen 156-clip set; 3 viewports: 390, 430, desktop)
27 real backend responses (9 clips × 3 viewports): **27/27 identical state + disposition to the 10Z-F reference**. No score, raw evidence, timing or hash appeared in any hop response. UI titles use the backend's copy.

| Case | Backend state / disposition | UI result |
| --- | --- | --- |
| A clear bird (robin) | species_candidate / lead | "Det låter mest som rödhake (Erithacus rubecula)." + 5 species lines |
| A2 clear bird (great tit) | species_candidate / lead | "…talgoxe (Parus major)." |
| B hard bird call (jay) | species_candidate / lead | "…nötskrika (Garrulus glandarius)." |
| C speech | speech / withhold | "Jag hör främst tal i inspelningen." — no species, states nothing is transcribed |
| D music | music / withhold | "Jag hör främst musik." — no species |
| E human whistle | human_whistle / withhold | "Det här låter mer som mänsklig vissling än ett tydligt fågelläte" — no species |
| F violin | music / withhold | music result, no species |
| G vehicle / G2 electronic | unresolved / withhold | "AI-örat kunde inte avgöra ljudet tillräckligt säkert" — no species |
| H silence (generated 3 s) | insufficient_signal / withhold | "Ljudsignalen räckte inte" + tips (närmare, mindre bakgrundsljud, försök igen) |
| I invalid audio | — (undecodable in browser) | "Ljudet kunde inte läsas" (no request sent) |
| J oversized (26 MB) | — | "Ljudfilen är för stor" (no request sent) |
| Microphone recording | fake mic playing a bird clip, 4 s | 200, species_candidate / lead, "…rödhake…" |

Not covered by a live case: `species_candidate/caveat` and `unavailable` (no such response for the chosen fixtures; both covered by unit/UI tests and contract fixtures). A backend `unavailable` cannot be provoked without a backend mutation.

## UI semantics checks
speech/music/whistle never show a species; `withhold` never shows a species as certain; unresolved shows no species; insufficient signal shows retry advice; lead follows the backend copy; no percentages/scores anywhere; frontend has no thresholds (source scan + tests).

## Loading / cancel / unmount / retry (real network path, delayed to 3.5 s to observe)
* Two rapid clicks on "Analysera ljudet" → **1** request; `aria-busy` present; loading still visible after 3 s; result appears.
* "Avbryt" → back to ready state, no error shown, request aborted; the next analysis returns 200.
* Leaving to the hub while a request is in flight → hub shown, no stale overlay, no console error; re-entering and analysing works (200).
* Timeout (hop 504) → "Det tog för lång tid" + "Försök igen"; after the backend fault is removed, retry of the same recording → 200 and result.
* Cold start: an instance started during the E2E (06:56Z, ~8 s probe) and the first call waited for it without UI issues; the 35 s client timeout is unit-tested.

## Error E2E (real hop with injected faults, real client)
| Fault | Hop response | User sees |
| --- | --- | --- |
| backend timeout (5 ms) | 504 PROVIDER_TIMEOUT retryable | "Det tog för lång tid" + retry |
| backend unreachable | 502 PROVIDER_UNAVAILABLE retryable | "AI-örat är tillfälligt otillgängligt" + retry |
| wrong Google credential | 502 PROVIDER_UNAVAILABLE | same generic message |
| missing Google credential | 502 PROVIDER_UNAVAILABLE | same generic message |
| Supabase/consent auth rejected | consent step 401 | "Ljudet kunde inte godkännas för analys" |
| Supabase auth rejected at the hop | 401 AUTH_INVALID | "Logga in för att använda AI-örat" |
| server switch off | 503 PROVIDER_NOT_CONFIGURED | "AI-örat är inte tillgängligt just nu" |
| WAV with no audio data (direct) | 400 (`empty_audio`) | invalid_audio "Ljudet kunde inte läsas" |
| 5 MB WAV posted straight to the hop | **413 REQUEST_TOO_LARGE** (curl, direct) | (the UI cannot produce this size: recordings are cut at 12 s, files > 25 MB are blocked) |
No error text or response contained Google/IAM/token/credential/service-account/Cloud Run wording.

## Defect found and fixed during the E2E
Cancelling during upload made the hop's body read reject unhandled (`ECONNRESET`), which crashed the local server process. Fixed in `api/ai-ear/interpret` (aborted upload → clean `REQUEST_ABORTED` response, no backend call) with a unit test. Also fixed: the Smart kamera privacy card wrongly said "AI får ingen kamerabild … Lokalt / sparas lokalt" in AI-örat mode; it now states that the chosen audio is sent to the server on tap and not saved (test added). A consent-endpoint network failure now maps to a retryable "network" message.

## Not done
Real Vercel-hosted hop, real Supabase login, real phone (iOS Safari / Android Chrome), Vercel duration limits. See `AI_EAR_AUTH_PROVISIONING_11B.md`.
