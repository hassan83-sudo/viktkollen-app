# SÖK-3 — Gratis röstsökning

Branch: `search-navigation-sprint1` (SÖK-1 `6c8d859`, SÖK-2 `2d6e9de`).

Speech is only an input method for the existing GlobalSearch. Same index, results and SÖK-1 navigation. No auto-navigation on transcript.

## Browser API

Uses `window.SpeechRecognition` or `window.webkitSpeechRecognition`. No MediaRecorder, no audio files, no network calls from Viktkollen.

Language is mapped from the active app locale when the mapping is known (`sv` → `sv-SE`, `en` → `en-US`, and the other supported app codes). Unknown codes use `sv-SE` (app default) instead of guessing.

## UI

Home search row (SÖK-2): **Sök** + **Röstsök** (🎤), 44px touch target, wrapping row, no horizontal overflow.

The host dialog also has a microphone next to the search field and **Avbryt** while listening. One recognition controller (the SÖK-2 host).

## Fallback and errors

| State | User-facing text |
|---|---|
| Unsupported | Röstsök stöds inte… skriv istället |
| Permission denied | Mikrofonåtkomst nekades… |
| No speech | Ingen röst hördes… |
| Audio capture / network / generic | Short Swedish/English copy |
| Abort | Röstsök stoppad |

Typed search, Ctrl+K and Cmd+K are unchanged.

## Privacy

Viktkollen does not upload, store, or log recordings or transcripts. Recognition runs through the browser API. The browser/OS vendor may still process speech according to **their** terms; this is not guaranteed to be on-device or offline.

## Cost / secrets

No API keys, env vars, Vercel/Cloud functions, or paid speech providers.

## Tests

Voice: standard + webkit API, unsupported, permission, no-speech, abort/stale transcript, single session, unmount cleanup, Swedish phrases, no auto-nav.

Regression: GlobalSearch, index/gating, shortcuts, OverviewDashboard, App.releasePolish.
