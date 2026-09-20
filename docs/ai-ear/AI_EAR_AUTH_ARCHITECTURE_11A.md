# AI-örat — auth architecture (Sprint 11A)

## Constraint
`perch-inference` is a **private** Cloud Run service (IAM-only; unauthenticated → 403). The browser must never hold a Google credential, mint Google tokens, or call Cloud Run directly. IAM is never bypassed.

## What exists (verified in the code, not assumed)
* Vercel serverless functions in `/api` (Node) authenticate users with **Supabase** bearer tokens. That is user auth; it says nothing about Google.
* No Google credential, service account, Workload Identity or Cloud Run call existed anywhere in the repo or its docs.
* So neither Vercel, Supabase nor the browser can authenticate to Cloud Run today.

## Chosen (smallest safe) architecture
```
Viktkollen UI (flag aiEar)
  -> POST /api/ai-ear/interpret          (Supabase bearer + consent token; body = one WAV)
  -> Vercel function (server-only):
       origin check -> server switch AI_EAR_ENABLED -> Supabase auth -> content-type -> rate limit
       -> size/WAV check -> consent token bound to these bytes -> Google ID token
  -> POST https://<cloud-run>/v2/interpret   (Authorization: Bearer <Google ID token>)
  -> reduced, validated result -> UI
```
* Google auth method: **service-account self-signed JWT with `target_audience` exchanged at `https://oauth2.googleapis.com/token` for an OIDC ID token** (a Google-supported way to call IAM-protected Cloud Run). Implemented in `api/_shared/googleIdToken.js` with `node:crypto` only (no new dependency), token cached until ~2 min before expiry. Errors carry a short code only.
* Credential: `AI_EAR_GCP_SERVICE_ACCOUNT_JSON` (plain or base64 JSON), **server-only Vercel env**, never `VITE_*`, never returned or logged, never committed (`.env.example` holds an empty placeholder).
* Alternative for later (better, keyless): Vercel OIDC → Google Workload Identity Federation → impersonate the invoker SA. Needs Vercel/GCP configuration; not chosen for 11A because it requires more cloud setup. The hop's only Google-specific code is `getGoogleIdToken`, so it can be swapped without touching the rest.

## Prerequisites NOT done (need explicit human approval — 11A performed no secret, IAM or Vercel mutation)
1. **Create a dedicated service account** (e.g. `ai-ear-hop`) in `perch-bird-poc`.
2. **Grant it `roles/run.invoker` on `perch-inference` only.** This is an IAM change on the production service (`gcloud run services add-iam-policy-binding perch-inference --region europe-west1 --project perch-bird-poc --member=serviceAccount:<sa> --role=roles/run.invoker`). Never `allUsers`.
3. Create a key for that SA (or set up WIF) and store it in Vercel as `AI_EAR_GCP_SERVICE_ACCOUNT_JSON` (Production + Preview only if wanted).
4. Set Vercel server env: `AI_EAR_BACKEND_URL=https://perch-inference-7sdznbf7dq-ew.a.run.app`, `AI_EAR_ENABLED=true` (kept `false` until the E2E test).
5. Confirm `ANALYSIS_CONSENT_SECRET` (>= 32 chars) exists in Vercel (used by the other analysis routes; the consent gate fails closed without it).
6. Check the Vercel plan limits: request body ~4.5 MB (the client sends <= ~0.8 MB) and **function max duration** — a Cloud Run cold start is ~8 s, the hop allows 28 s, so the function's duration limit must be >= ~30 s (set per function in Vercel config if the plan default is 10 s). Not changed in 11A.

Until 1–4 are done the hop answers `503 PROVIDER_NOT_CONFIGURED` and the UI shows "AI-örat är inte tillgängligt just nu". The feature is also hidden by the client flag.

## Defence in depth (each layer independent)
Client flag `aiEar` (default off) · server switch `AI_EAR_ENABLED` · Supabase login · per-user rate limit · size + content-type + WAV signature check · consent token (HMAC, bound to the exact audio, user, purpose, 2-min TTL) · Cloud Run IAM (only the invoker SA) · backend limits (8 MB, 12 s analysed, decode guard).
