# AI-örat — release checklist (Sprint 11A) — actual results

- [x] secure server-side hop implemented (`api/ai-ear/interpret`, tests green; **not deployed**)
- [x] no credentials in frontend (0 findings; test-enforced)
- [x] v2 contract mapped (fixtures from real replay; `AI_EAR_API_MAPPING_11A.md`)
- [x] bird works (lead + caveat) — unit/UI + real backend format check
- [x] speech works (no transcript, no species)
- [x] music works
- [x] whistle works (separate from bird)
- [x] unresolved works
- [x] insufficient signal works (with advice)
- [x] unavailable works
- [x] loading / cold-start UX works (spinner, 30 s wording, double-submit guard, cancel, 35 s timeout, retry)
- [x] errors mapped (400, 401/403, 413, timeout, 5xx, network, offline, rate limit, malformed)
- [x] privacy preserved (transient audio, explicit consent tap, no storage/logging)
- [x] tests green (all 11A tests: 87; whole suite 0 new failures vs baseline; 57 pre-existing failures remain)
- [x] lint/build green for 11A (ESLint clean on 11A files; build, i18n checks pass) — whole-repo lint has pre-existing errors
- [x] mobile verified (390, 430, desktop harness: no overflow, 44 px targets) — **not** verified in the real logged-in app
- [x] backend unchanged (Cloud Run `perch-inference-rc10ze-1` = 100 %, generation 14, re-checked read-only at the end)
- [x] production frontend still OFF (client flag `aiEar` default false; server `AI_EAR_ENABLED` default off; nothing deployed)

## Still open before anyone can use it (human approval needed)
- [ ] service account + `roles/run.invoker` on `perch-inference` (IAM change)
- [ ] Vercel server env: `AI_EAR_GCP_SERVICE_ACCOUNT_JSON`, `AI_EAR_BACKEND_URL`, `AI_EAR_ENABLED=true`, `ANALYSIS_CONSENT_SECRET` present
- [ ] Vercel function max duration >= ~30 s and body limit check
- [ ] deploy (preview first) and real E2E with a logged-in user on a phone (mic, iOS Safari/Chrome Android)
- [ ] product decisions PD-1..PD-5, legal YELLOW / HIGH-CVE decisions (unchanged)
