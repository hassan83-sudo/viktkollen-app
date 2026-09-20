# AI-örat — privacy (Sprint 11A)

Audio is transient end to end.

| Stage | Behaviour |
| --- | --- |
| Microphone | Started only by the user's "Spela in" tap (Permissions-Policy already allows `microphone=(self)`); max 12 s; tracks stopped on stop, error and unmount; visible "● Mikrofon aktiv" indicator |
| Device | MediaRecorder chunks -> WAV in memory only. Never written to localStorage/sessionStorage/IndexedDB (tests assert no `setItem`; a source scan forbids storage APIs in the feature files) |
| Consent | Nothing is sent until the user taps **Analysera ljudet**, next to the text "…skickas just det här ljudet till Viktkollens server för analys. Ljudet sparas inte och ingen skriver ut vad som sägs." The tap is the only place `consentApproved:true` is set; the server verifies an HMAC consent token bound to the exact audio bytes, user and purpose |
| Hop (Vercel) | Holds bytes in memory for one request; no disk, no Supabase write, no cache (`Cache-Control: no-store`). Logs only: request id, generic status/reason codes, audio byte count. Never audio, file names, Authorization, tokens, species, scores, model paths |
| Backend | Unchanged; its logs are whitelisted structured events (verified in 10Z-F..I) |
| Result | Shown in the UI; not stored, no audio history, no transcript. Speech is never transcribed (state `speech` only says speech was heard) |

Limits: recordings of longer than 12 s are cut on the device; only the first 12 s are analysed.
What is NOT covered here: the legal/privacy-policy wording for sending audio to a server (product/legal task), and platform-level logs (Vercel/Google request logs contain IP/URL, not bodies). Legal status of the model stack remains **YELLOW** (no legal approval).
