# AI-örat — final release checklist (Sprint 11B) — actual results

- [x] backend remains private (policy: only the hop SA as invoker; unauthenticated → 403)
- [x] least-privilege invoker configured (`ai-ear-hop`, `roles/run.invoker` on `perch-inference` only; no project roles)
- [~] server-only auth works — **proven** with the real hop code + real SA + real private Cloud Run (local run); **not** configured on Vercel (no access)
- [x] no credentials in client (build scan 0/18; source scan 0)
- [~] real UI → proxy → Cloud Run → UI works — real UI + real hop code + real Google auth + real Cloud Run locally; Supabase login stubbed; not on Vercel/preview
- [x] bird works (3 clips + microphone recording)
- [x] speech works
- [x] music works (incl. violin)
- [x] whistle works
- [x] unresolved works
- [x] insufficient signal works
- [x] errors work (400, 413 direct, timeout, backend down, bad/missing credential, auth, server switch off)
- [x] loading works (cold start observed; delayed-request test)
- [x] retry works
- [x] cancellation works (and an abort crash bug was fixed)
- [~] mobile works — 390/430/desktop emulation clean; **no real phone**
- [x] privacy clean (hop logs and Cloud Run logs: 0 hits; audio not stored; privacy card wording fixed)
- [x] security clean (0 findings requiring action)
- [x] tests green — all AI-örat tests (153 in api/_shared + api/ai-ear + ai-ear + aiEar services); whole suite: 56 failing tests, all pre-existing and unrelated (same files as the 11A baseline), 0 new
- [x] lint green for AI-örat files (whole-repo lint has pre-existing errors); i18n checks pass
- [x] build green
- [x] backend unchanged (rc10ze-1 = 100 %, generation 14)
- [x] feature flag OFF for ordinary users (client `aiEar` default false; server `AI_EAR_ENABLED` not set; nothing deployed)

## Blocking items for "ready to enable" (all need Hassan / Vercel access)
1. Vercel login/token; set the four server-only env names (see provisioning doc); choose key vs WIF.
2. Confirm Vercel function max duration ≥ ~30 s.
3. Preview deploy → same E2E through the preview URL with a real test user → real iPhone + Android.
4. Then Hassan decides on `AI_EAR_ENABLED=true` and on enabling the client flag (per-user/cohort mechanism is a product decision; the flag is per-browser today).
5. Unchanged: product decisions PD-1..PD-5, privacy-policy wording, legal YELLOW, HIGH-CVE decision.
