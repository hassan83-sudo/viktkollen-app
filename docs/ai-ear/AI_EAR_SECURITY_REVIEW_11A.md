# AI-örat — security review (Sprint 11A)

Scope: all files added/changed in 11A (see inventory). Method: grep/regex scans + automated tests (`aiEarIntegration.test.js`) + manual reading.

| Check | Result |
| --- | --- |
| Private keys / service-account JSON in repo (`BEGIN … PRIVATE KEY`, `"type":"service_account"`, `AIza`, `ya29.`, JWT literals) in non-test source, `.env.example` | **0 findings** (tests generate a throw-away RSA key at run time) |
| Google credentials, tokens or Cloud Run URL in client code (`src/features/ai-ear`, `src/services/aiEar*.js`) | **0** (test scans comment-stripped source for `private_key`, `client_email`, `service account`, `oauth2.googleapis`, `run.app`, `.iam.`, `AI_EAR_(BACKEND|ENABLED|GCP)`, `id_token`, `process.env`) |
| Unsafe `VITE_` env / `import.meta.env` for AI-örat | **0**; `.env.example` has server-only `AI_EAR_*` placeholders, empty credential, `AI_EAR_ENABLED=false` |
| Authorization / token / audio / file-name logging | **0**: the hop's only log calls carry request id, generic reason/status codes, byte count; test scans all `console.*` calls and asserts secrets, tokens, audio, `audio.wav`, Bearer never appear in logs or responses |
| Raw audio persistence (storage APIs, DB, disk) | **0** (source scan + test) |
| Backend detail leakage to clients | none: 401/403/5xx from Cloud Run → generic `PROVIDER_UNAVAILABLE`; Google refusal → generic; only an allowlist of 6 backend 400 codes is passed as `reason`; response reduced (no raw evidence/scores/timing/hashes) |
| IAM bypass | none: no public access, no `allUsers`, hop uses an ID token for the invoker SA only |
| Auth/consent ordering | origin → server switch → Supabase auth → content type → rate limit → size (streamed, aborts at limit) → WAV signature → consent (bound to bytes) → Google token → backend; each rejection tested to make **no** Google/backend call |
| Malformed backend response | rejected (`PROVIDER_INVALID_RESPONSE`); species stripped unless lead/caveat; unknown state → unavailable |
| Dependency changes | none (Node built-ins only) |

## Residual risks / notes
1. Service-account **key** in a Vercel env var is long-lived; prefer WIF later (`AI_EAR_AUTH_ARCHITECTURE_11A.md`). Rotate/scope to `run.invoker` on this one service.
2. Consent token replay window (<= 2 min, same user/audio/purpose) is the existing, documented design of `analysisConsent.js`.
3. Rate limiting is process-local (the existing adapter), so it is best-effort across serverless instances.
4. The client feature flag is a per-browser localStorage override; the real gate for users is the server switch `AI_EAR_ENABLED`.
5. Pre-existing repo state: `npm run lint` reports ~790 errors and `npm test` ~57 failing tests **before and after** 11A (baseline compared with the 11A tracked changes stashed: 0 new failures). All 11A files lint clean.

**Findings requiring action: 0.**
