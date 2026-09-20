# AI-örat — API mapping (Sprint 11A)

Frozen contract: `perch-validation/sprint10x/openapi/interpret-v2.candidate.yaml` (apiVersion 2). Fixtures: `src/features/ai-ear/fixtures/backendFixtures.js` = real backend responses from the 10Z-F Cloud Run replay (rawEvidence, timing, hashes removed); `insufficient_signal` / `unavailable` are contract-shaped variants because both states are in the OpenAPI enum but rare in the replay set. No fields were invented.

## Browser -> hop
`POST /api/ai-ear/interpret?locale=sv-SE` · headers `Authorization: Bearer <Supabase>`, `Content-Type: audio/wav`, `x-viktkollen-consent-token` · body = one mono 16-bit PCM WAV (<= 12 s, <= 32 kHz, ~0.4–0.8 MB). The browser turns any recording/file into WAV itself (`aiEarAudio.js`) because the backend cannot decode WebM/Opus or MP4/AAC.

## Hop -> Cloud Run
`POST <AI_EAR_BACKEND_URL>/v2/interpret`, multipart `file` (audio.wav) + `locale`; `includeRawEvidence` is never sent.

## Hop -> browser (reduced result; everything else is dropped)
`{ ok:true, requestId, result: { apiVersion, state, speciesDisposition, speciesCandidates[{rank,label,ebirdCode}], reasonCodes[], userFacing{copyKey,headline,body,speciesLines[],contextLines[],locale}, signal{durationSec,nearSilence,tooShort,truncated}, flags{caveat,partialModels}, routerVersion } }`. No rawEvidence, no scores, no timing, no model hashes/paths. Species candidates and species lines are removed unless `speciesDisposition` is `lead` or `caveat`.

## States (UI `aiEarViewModel.js`)
| Backend state | UI | Species shown? |
| --- | --- | --- |
| `species_candidate` + `lead` | backend headline + up to 5 species lines | yes |
| `species_candidate` + `caveat` | backend headline + 1 hedged line ("Möjlig kandidat, osäker: …") | 1 caveat line |
| `speech` | "AI-örat hör främst tal"; states that nothing is transcribed or saved | never |
| `music` | "Jag hör främst musik" | never |
| `human_whistle` | separate whistle result (not a bird result) | never |
| `mixed_scene` | headline + context lines; only a backend caveat line if given | only backend caveat |
| `unresolved` | "AI-örat kunde inte avgöra ljudet tillräckligt säkert" (+ backend caveat line if given) | only backend caveat |
| `insufficient_signal` | "Ljudsignalen räckte inte" + tips (närmare, mindre bakgrundsljud, försök igen) | never |
| `unavailable` / unknown state | temporary error, no internals | never |

Dispositions `lead | caveat | withhold | unavailable` come from the backend; **no thresholds or score logic exist in the frontend**. Defence in depth: even if a payload carried species text for speech/music/whistle or a `withhold`, the view model and the hop drop it. Text is the backend's Swedish `userFacing` copy where available; own copy only for insufficient signal, unavailable, unresolved framing and errors. Footer on every result: "AI-örat är en prototyp. Resultatet är en indikation, inte en garanti." Scores are never displayed.

## Errors
| Source | UI reason |
| --- | --- |
| 400 / `audio_decode_failed`, `empty_audio`, … | `invalid_audio` "Ljudet kunde inte läsas" |
| 415 | `unsupported_media` |
| 413 | `too_large` |
| 401 / AUTH_* | `auth_required` (Supabase login) |
| 403 CONSENT_REQUIRED | `consent_required` |
| 429 | `rate_limited` |
| 504 / client 35 s timeout | `timeout` (retry) |
| 503 PROVIDER_NOT_CONFIGURED | `not_available` |
| 502 / 5xx incl. hop-to-Cloud-Run 401/403 | `service_unavailable` (generic; no Google/IAM detail) |
| network / offline | `network` / `offline` |
| bad/invalid payload | `invalid_response` |

Loading/cold start: spinner + `aria-busy`, "Första gången kan det ta upp till en halv minut", single-flight (no double submit), Avbryt (AbortController), 35 s client timeout, retry of the same recording, unmount aborts and updates no state.
