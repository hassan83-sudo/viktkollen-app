# SPRINT_11B_REPORT — AI-örat final auth + production E2E

Date 2026-09-20. Backend frozen and unchanged (`perch-inference-rc10ze-1` = 100 %, generation 14). No commit, no deploy, no Vercel change.

> **FINAL (completion, 2026-09-20): FINAL E2E PASSED** through the Vercel preview with a real Supabase login, the Vercel hop, Google auth and the private Cloud Run — see `AI_EAR_FINAL_E2E_VERCEL_11B.md`. Cleanup done except deleting the Supabase test user (needs the Supabase dashboard). The decision text below is the historical intermediate result.
>
> **Update (continuation, later on 2026-09-20):** Vercel access is now resolved and Preview env + a preview deployment exist; the one remaining blocker is a Supabase test session. See `AI_EAR_VERCEL_REMEDIATION_11B.md`.

## Decision: B) FINAL E2E PARTIAL — exact remaining prerequisite: Vercel access (resolved in the continuation; see update above)
Everything that can be done without Vercel is done and green. What is missing is only the Vercel side: no Vercel credentials exist on this machine (CLI not installed, no login/token), so the server-only env could not be set, no preview could be deployed, and no phone test could run. Marked B instead of A because the chain has not been proven on Vercel/Supabase/phone; it has been proven end to end locally with the real hop code.

## Done
1. **11A verified intact** (git status unchanged, 136 tests green) before any mutation.
2. **Identity**: read-only inventory (only the Editor-level default compute SA existed → not reused). Created dedicated `ai-ear-hop`; granted `roles/run.invoker` on `perch-inference` only; no project roles; service stays private (verified).
3. **Auth proven**: the hop's own `getGoogleIdToken` with that SA → private Cloud Run `/v2/health` 200 (403 without token). A temporary key was used only for the local run and then deleted from GCP and disk.
4. **Real E2E** (local rig; real UI, hop, Google auth, private production Cloud Run): 9 fixtures × 3 viewports = **27/27 identical to the 10Z-F reference**; microphone recording; silence, invalid, oversized; loading, double-submit, cancel, unmount, timeout + retry; 7 injected fault modes; all UI semantics as required (speech/music/whistle never a bird; unresolved invents nothing; insufficient signal gives advice; no scores).
5. **Privacy**: hop logs and Cloud Run logs after the E2E: 0 hits; no audio storage in code; no credentials/Authorization/scores logged.
6. **Secret scan** of the fresh production build: 0/18 patterns; source scan 0.
7. **Tests/lint/build**: 153 AI-örat-related tests green; whole suite 56 failures = the same pre-existing unrelated files as before (0 new); AI-örat files lint clean; i18n checks and build pass.
8. **Defects found and fixed by the E2E**: (a) client abort mid-upload crashed the hop's body read → clean `REQUEST_ABORTED` (+test); (b) the Smart kamera privacy card said "AI får ingen kamerabild / Lokalt" in AI-örat mode → now states that audio is sent on tap and not saved (+test); (c) consent-endpoint network failure now retryable "network".

## Not done (needs Hassan / Vercel)
* Vercel: login, server-only env (`AI_EAR_GCP_SERVICE_ACCOUNT_JSON` or WIF, `AI_EAR_BACKEND_URL`, `AI_EAR_ENABLED`, confirm `ANALYSIS_CONSENT_SECRET`), function duration ≥ ~30 s, preview deploy.
* Real Supabase login in the chain; real iPhone/Android test.
* Keyless (WIF) option not built. The temporary key is deleted, so a new key (or WIF) is needed for Vercel — command in `AI_EAR_AUTH_PROVISIONING_11B.md`.
* Legal YELLOW, HIGH-CVE, product decisions PD-1..PD-5, privacy-policy wording.

## Final state
Feature flag `aiEar` default OFF; server `AI_EAR_ENABLED` unset; nothing deployed; ordinary users cannot reach AI-örat. Read-only re-check at the end: service policy = single hop-SA invoker binding, unauthenticated 403, traffic 100 % on rc10ze-1.

Docs: `AI_EAR_AUTH_PROVISIONING_11B.md`, `AI_EAR_E2E_RESULTS_11B.md`, `AI_EAR_PRIVACY_FINAL_11B.md`, `AI_EAR_SECURITY_FINAL_11B.md`, `AI_EAR_MOBILE_RESULTS_11B.md`, `AI_EAR_FINAL_RELEASE_CHECKLIST_11B.md`. Evidence: `perch-validation/sprint11b/`.
