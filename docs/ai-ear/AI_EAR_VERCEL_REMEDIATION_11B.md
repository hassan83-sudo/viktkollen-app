# AI-örat — Vercel remediation (Sprint 11B, continuation)

Date 2026-09-20. Backend untouched (rc10ze-1 = 100 %, generation 14). Secret values are not recorded here.

## Vercel access — resolved
Vercel CLI 59.23.2 (run through `npx`), authenticated as the logged-in user; team `appsonthego-s-projects` (Hobby); repo linked to project `viktkollen-app` (`prj_rJHY…`). Existing env names before 11B: `ANALYSIS_CONSENT_SECRET` (Development/Preview/Production), `OPENAI_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_NUTRITION_PHOTO_REMOTE_ENABLED`.

## Provisioned (Preview scope only; Production untouched)
| Env name | Scope | Type | Purpose |
| --- | --- | --- | --- |
| `AI_EAR_GCP_SERVICE_ACCOUNT_JSON` | Preview | sensitive (write-only) | credential of `ai-ear-hop` for the server-side hop |
| `AI_EAR_BACKEND_URL` | Preview | — | private Cloud Run URL / ID-token audience |
| `AI_EAR_ENABLED` | Preview | — | server switch = `true` for preview E2E |

* Auth method: the 11B-chosen key path (Vercel OIDC/WIF not built). A **new** key was necessary because the temporary one had been deleted. It was streamed `gcloud … keys create - | validate | vercel env add … --sensitive`: **no key file was ever written** (checked scratchpad, repo, docs, src, api; no `-` file). It now exists only inside Google Cloud (one user-managed key on `ai-ear-hop`) and in Vercel's sensitive Preview env. Rotate/delete it when moving to WIF or after the E2E.
* **Production env has no `AI_EAR_*` variables**, so the production hop answers "not configured" (503) and the feature stays unreachable; the client flag `aiEar` is also default off.
* Nothing is `VITE_*` / `NEXT_PUBLIC_*`.
* IAM unchanged since 11B: the service policy has exactly one binding (`ai-ear-hop` → `roles/run.invoker`); unauthenticated call → 403; no allUsers/Owner/Editor.

## Repo change
`vercel.json`: added `functions["api/ai-ear/interpret/index.js"].maxDuration = 30` (cold start ~8 s, hop timeout 28 s; default Hobby duration would cut the request). Nothing else changed.

## Preview deployment
`https://viktkollen-mug28es1q-appsonthego-s-projects.vercel.app` (target **preview**, status Ready). Built from a clean copy of the working tree (tracked + new app files, without `perch-validation/` [6 GB], `docs/`, `.env*`, `node_modules`) so no local secret or research data was uploaded. Deployment Protection (Vercel SSO) is on: plain requests get a 302; `vercel curl` passes it. No production deploy.

Checks on the preview:
* Lambda `api/ai-ear/interpret/index` built and deployed.
* `POST /api/ai-ear/interpret` without login → `401 AUTH_REQUIRED` JSON — proves the deployed hop passed origin + server switch (env present) and enforces Supabase auth.
* Secret scan of the deployed client bundle (25 asset files, 2.2 MB): 0 matches for `PRIVATE KEY`, `private_key`, `client_email`, `gserviceaccount.com`, `ai-ear-hop`, all `AI_EAR_*` names, `oauth2.googleapis.com`, `perch-inference`, the Cloud Run host, `run.app`, `target_audience`, `ANALYSIS_CONSENT_SECRET`, `service_account`. (One `id_token` match is the Supabase vendor library's own OAuth grant type.) No credential file on disk.

## Update: test-user login attempt (later on 2026-09-20)
The test credentials were placed in `.env.local` (names only checked, values never printed). Direct password sign-in against the app's Supabase project returned `400 invalid_credentials` (both via the preview login form and a direct Auth API call), so no session could be obtained: the user either does not exist in that Supabase project or the password differs. A temporary Vercel automation-bypass secret created for the browser test was **revoked again** (only the pre-existing one remains). Nothing else changed; no user, key or env cleanup has been done yet because the E2E has not run.

## The single remaining blocker: a real Supabase test session
The hop only accepts a logged-in Supabase user, and the repo has no test account (project policy: test users are created by a human, never production accounts; Preview and Production share one Supabase project). I did not create a user in the production Supabase project.
**Instruction for Hassan:** create one throw-away test user (Supabase Dashboard → Authentication → Users → Add user, auto-confirm) and put `AI_EAR_E2E_EMAIL=` and `AI_EAR_E2E_PASSWORD=` in the local, git-ignored `.env.local` (never in chat). Then the sprint continues from here: sign in on the preview (Playwright, protection bypass via Vercel), run the fixture E2E through Vercel → private Cloud Run, check logs, delete the test user, delete the Cloud key, and finish.
