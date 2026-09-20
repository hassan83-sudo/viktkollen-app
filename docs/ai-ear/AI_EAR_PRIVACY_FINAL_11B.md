# AI-örat — privacy, final (Sprint 11B)

## Logs after real E2E calls
* **Hop logs** (local rig run, 266 lines, 70 successful requests plus fault cases): only `[api/ai-ear/interpret] Completed {audioBytes, requestId}`, generic warnings (`Backend request failed`, `Backend returned an error status`, `Upload aborted by client`) and `Backend auth unavailable {code, requestId}`. Scan for: private-key fragments, key id, service-account e-mail, `Bearer`, `eyJ` (JWT), local test token, consent token, `rawScore`, `rawEvidence`, `sha256`, `.wav`, `audio.wav`, `Traceback`, `oauth2`, `id_token`, `access_token` → **0 hits**. (The rig's own request echo prints path/host/origin/content-length only and is not part of the app.) Evidence: `perch-validation/sprint11b/hop_log_audit.json`.
* **Cloud Run logs** since the service account was created (379 rows, 188 requests, all from the test machine — no other client): app events only `interpret.done` (177), `interpret.rejected` (1), `startup.done` (1); **0 keys outside the whitelist; 0 hits** for filenames, tokens, tracebacks, model paths, raw scores, transcripts or species names. Statuses 200 ×180, 403 ×7 (unauthenticated probes / IAM propagation), 400 ×1 (empty WAV test). Evidence: `cloud_run_log_audit.json`.
* No raw audio, transcript, speech content, filename, raw score, credential, Authorization header or private key in any log.

## Retention
The hop has no filesystem, database, Supabase or storage code (static scan; no `fs`/`writeFile`/`upload` in `api/ai-ear` or `api/_shared/googleIdToken.js`); audio lives in memory for one request; responses are `Cache-Control: no-store`. The client stores nothing (tests assert no localStorage/sessionStorage/IndexedDB writes; recordings are dropped on reset/unmount, microphone tracks stopped). No temp files are created by the code.

## User-facing wording
Ready state: "…skickas just det här ljudet till Viktkollens server för analys. Ljudet sparas inte och ingen skriver ut vad som sägs." The Smart kamera privacy card now says the same for AI-örat (fixed in 11B; it previously showed camera/local wording). Speech is never transcribed.

## Still open (not engineering)
Privacy-policy text for sending audio to a server; Vercel/Google platform request logs (IP, URL, no bodies) are governed by those platforms; legal status of the model stack remains **YELLOW**.
