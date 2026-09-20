# AI-örat — final E2E through the Vercel preview (Sprint 11B, completion)

Date 2026-09-20. No secret values recorded. Backend untouched.

## Chain that was tested (all real)
Vercel **preview** deployment of the current working tree (built from a clean copy, `vercel.json` with `maxDuration 30`) → real **Supabase password login** (test user, real session) → real Smart kamera UI → "AI Örat" → `/api/ai-ear/interpret` on **Vercel** (real hop code, Preview env) → server-side **Google ID token** (dedicated SA) → **private production Cloud Run** `perch-inference-rc10ze-1` `/v2/interpret` → response → UI result. Headless Chromium (fake microphone device, service worker blocked so the app cannot reload mid-test); the preview's Vercel SSO protection was bypassed for the test run with a temporary automation secret (revoked afterwards).

## Results (evidence: `perch-validation/sprint11b/pv_e2e_results.json`, screenshots `pv_390_*.png`)
* **Semantic**: 7 fixtures × 3 viewports (390, 430, desktop) = **21/21 identical state + disposition to the 10Z-F reference**: clear bird (rödhake, lead), hard bird call (nötskrika, lead), speech, music, human whistle, violin (music), vehicle (unresolved). Every response had `Cache-Control: no-store` and contained no score/raw evidence/timing/hash. UI text follows the backend copy; speech/music/whistle/unresolved show no species.
* **Also**: silence (generated) → `insufficient_signal` + retry advice; invalid audio → "Ljudet kunde inte läsas"; 26 MB file → "Ljudfilen är för stor"; microphone recording (fake device playing a bird) → 200, rödhake.
* **Loading/cancel/unmount/retry** on the real Vercel hop: two clicks → 1 request, `aria-busy`, loading still visible after 3 s, result follows; cancel → back to ready, no error, next request 200; leaving to the hub mid-request → no stale overlay, next analysis 200; simulated 504 → "Det tog för lång tid" and retry on the real hop → 200 + result.
* **Error mapping** (network-level simulation of hop 504 / 502 / 401 / 503 and a network failure): correct friendly text, retry button where retryable, no Google/IAM/token/credential wording.
* **Real hop errors through Vercel**: no auth → `401 AUTH_REQUIRED`; bad token → `401 AUTH_INVALID`; non-WAV → `415 unsupported_media`; missing consent token → `403 CONSENT_REQUIRED`; 5 MB body → `413` (returned by Vercel's platform limit before the function; the function's own 413 is unit-tested and was proven in the local rig).
* **Rate limiting works on Vercel** (observed by accident): after many test attempts `analysis-consent` returned `429 RATE_LIMITED` and the UI showed a friendly message. For the final run the Preview limits were temporarily raised (test-only env, removed afterwards).
* Layout: 0 px horizontal overflow at all three viewports; 0 console errors.

## Privacy / logs
* **Vercel runtime logs** (72 `/api/ai-ear` request rows): only `Completed {audioBytes, requestId}` and `Consent rejected {reason, requestId}`; 0 hits for private-key text, service-account address, `Bearer`, JWT, tokens, `rawScore`, `sha256`, file names, species names, transcripts, or the test user's e-mail (`vercel_log_audit.json`).
* **Cloud Run logs** for the run: 95 requests, all 200, from Vercel's AWS egress addresses (UA node); app events only `interpret.done` (95) and one `startup.done`; 0 keys outside the whitelist; 0 forbidden strings; one cold start (~8 s) absorbed by the UI (`cloud_run_log_audit_vercel.json`).
* No audio retention: no storage/DB/file code in the hop; nothing persisted client-side.

## Security
Deployed client bundle (24 files, 1.9 MB): **0** matches for 18 credential/config patterns (private key text, `client_email`, SA e-mail, `gserviceaccount.com`, all `AI_EAR_*` names, `oauth2.googleapis.com`, Cloud Run name/host, `target_audience`, `ANALYSIS_CONSENT_SECRET`, `service_account`, the test e-mail and the test password); `api/ai-ear/interpret` appears only as the public client path. Cloud Run still private: exactly one binding (`ai-ear-hop` → `roles/run.invoker`), unauthenticated → 403; backend `perch-inference-rc10ze-1` = 100 %, generation 14.

## Cleanup performed
* Google Cloud: the temporary user-managed key **deleted** (0 user-managed keys remain on `ai-ear-hop`); no key file ever existed on disk.
* Vercel: Preview env `AI_EAR_GCP_SERVICE_ACCOUNT_JSON`, `AI_EAR_ENABLED`, `AI_EAR_BACKEND_URL`, `AI_EAR_RATE_LIMIT_MAX`, `ANALYSIS_CONSENT_RATE_LIMIT_MAX` **removed** (production never had `AI_EAR_*`); both preview deployments **removed**; the temporary automation-bypass secret **revoked** (only the pre-existing one remains).
* `.env.local`: `AI_EAR_E2E_EMAIL` / `AI_EAR_E2E_PASSWORD` **removed**; temporary scripts, log copies and deploy copies deleted.
* **Not done by me:** deleting the Supabase test user `aiear-test@example.com`. Only the public anon key is available here; the app's own account-deletion route needs `SUPABASE_SERVICE_ROLE_KEY` on Vercel, which is not configured. **Hassan: delete it in Supabase Dashboard → Authentication → Users** (one click). The user only has a login session and whatever the home screen synced for it.

## To enable later (Hassan's decision; not done)
Provision the hop credential again (a fresh key piped into Vercel, or WIF), then in **Production** set `AI_EAR_GCP_SERVICE_ACCOUNT_JSON`, `AI_EAR_BACKEND_URL`, `AI_EAR_ENABLED=true`, deploy, and flip the client flag for the chosen audience (flag is per-browser today). Commands: `AI_EAR_AUTH_PROVISIONING_11B.md`.
