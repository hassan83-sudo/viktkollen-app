# AI-örat — security, final (Sprint 11B)

## Cloud / IAM
* `perch-inference` is still private. Policy = one binding: `serviceAccount:ai-ear-hop@…` → `roles/run.invoker`. No `allUsers`/`allAuthenticatedUsers`; unauthenticated request → 403 (re-checked at the end).
* The SA has **no project-level roles** and is used for nothing else. The default compute SA (Editor) was not used.
* Backend untouched: revision `perch-inference-rc10ze-1` = 100 %, generation 14, healthy (`/v2/health` 200 with an authenticated call), rollback `perch-inference-00010-wmj` retained. No image/traffic/resource/scaling change. The only Cloud change in 11B was creating the SA, the service-scoped invoker binding, and a temporary key (deleted).
* No user-managed keys exist for the SA now (`keys list --managed-by=user` → empty); the local key file was deleted.

## Client secrecy — build output scan
`npm run build` (100 files, 11 MB in `dist/`), scanned for 18 patterns: `PRIVATE KEY`, the key id, a private-key line, the SA e-mail, `gserviceaccount.com`, `AI_EAR_GCP_SERVICE_ACCOUNT_JSON`, `AI_EAR_BACKEND_URL`, `AI_EAR_ENABLED`, `oauth2.googleapis.com`, `perch-inference`, the Cloud Run host id, `run.app`, `private_key`, `client_email`, the rig consent secret, the rig test token, `ANALYSIS_CONSENT_SECRET`, `target_audience` → **0 files match any**. Source scan for the key id / `BEGIN PRIVATE KEY` in `src`, `api`, `docs`, `.env.example` → 0. No `VITE_*` / `import.meta.env` in the AI-örat client files (test-enforced). No secret in docs, screenshots or artifacts; `perch-validation/sprint11b/` holds only result JSON and three UI screenshots.

## Server hop
Order of checks (each rejection makes no Google/backend call): origin → server switch → Supabase auth → content type → rate limit → streamed size limit → WAV signature → HMAC consent token bound to the exact audio/user/purpose → Google ID token → backend. Robust against client abort mid-upload (fixed in 11B). Errors to clients are generic; backend/Google details never leave the hop; only 6 allowlisted backend 400 codes are passed as a `reason`. 21 hop tests + 4 token tests + 5 client-hygiene tests.

## Verified in E2E
Wrong/missing Google credential → generic 502 (no detail); Supabase rejection → login/consent messages; switch off → 503 "not available"; unauthenticated direct call to Cloud Run → 403; 5 MB body → 413; no credential/IAM wording in any UI text or response.

## Residual risks
1. Long-lived SA key in Vercel env if the key path is chosen → prefer WIF (not built), rotate, scope stays `run.invoker` on one service.
2. Rate limiting is process-local (existing adapter).
3. Consent-token replay window ≤ 2 min for same user/audio/purpose (existing design).
4. Client flag is per-browser; real gate is the server switch `AI_EAR_ENABLED` (default off).
5. Not verified on real Vercel: env handling, function duration/body limits, cold-start behaviour of the function.
6. Legal YELLOW / HIGH-CVE decisions unchanged.

**Security findings requiring action in code: 0.** (One privacy-wording defect and one abort-handling defect were found and fixed during 11B.)
