# AI-örat — auth provisioning (Sprint 11B)

No secret values appear in this document.

## Read-only inventory first (2026-09-20)
Project `perch-bird-poc` had exactly one service account: the default compute SA (`…-compute@developer.gserviceaccount.com`) which holds **roles/editor** and runs the Cloud Run services. It was **not reused** (far too broad, shared with unrelated workloads). No identity for AI-örat existed. `perch-inference` IAM policy was empty (private). Org policy `iam.disableServiceAccountKeyCreation` was not enforced.

## Provisioned (approved mutations, all read-only-verified afterwards)
| What | Value | Purpose |
| --- | --- | --- |
| Service account | `ai-ear-hop@perch-bird-poc.iam.gserviceaccount.com` (name `ai-ear-hop`) | dedicated identity for the Viktkollen server-side hop; used for nothing else |
| Project-level roles of this SA | **none** | verified with `projects get-iam-policy` filter: no bindings |
| Cloud Run IAM | `roles/run.invoker` for that SA **on service `perch-inference` only** (europe-west1) | lets the hop call `/v2/interpret` |
| Resulting service policy | exactly one binding (the SA / `roles/run.invoker`), etag changed `BwZbwp-BWAg=` → `BwZb5JsmnMM=`; **no `allUsers` / `allAuthenticatedUsers`** | service stays private |
| Propagation | first token attempts got 403 for ~40 s, then 200 | normal IAM propagation |

Verified: an ID token minted by the app's own `getGoogleIdToken` for this SA (audience = service URL, email claim = the hop SA) → `GET /v2/health` **200**; the same request without a token → **403**.

## Temporary key (for the local real-auth E2E only) — DELETED
To exercise the real production auth code path (`api/_shared/googleIdToken.js`) against the real private service, one user-managed key was created on 2026-09-20 ~06:54Z, held only in a file outside the repository (never in `.env*`, docs, logs or the build), and **deleted from Google Cloud and from disk at the end of the E2E** (`iam service-accounts keys list --managed-by=user` → empty). Housekeeping note: while measuring the client bundle, one command echoed a single base64 line of that private key into the tool output of this session; since the key was already deleted afterwards it is void. Key id is deliberately not recorded here.

## What is NOT done (blocked on Vercel access)
No Vercel credentials exist on this machine (no CLI installed, no login/token; the repo is linked to Vercel project `viktkollen-app` via `.vercel/repo.json`). Setting Vercel env, deploying a preview and testing on a phone were therefore **not possible**. Required, in this order:

1. `vercel login` (or a Vercel token) for the team that owns `viktkollen-app` — e.g. run `! npx vercel login` in this session.
2. Credential for the hop, choose one:
   * **Keyless (preferred, not built):** Vercel OIDC → Google Workload Identity Federation → impersonate `ai-ear-hop`. Needs the Vercel team slug/issuer, a WIF pool/provider, `roles/iam.workloadIdentityUser` on the SA, and a small change in `getGoogleIdToken` (STS exchange + `generateIdToken`). Not started (needs Vercel info and a design pass).
   * **Key (proven path):** create a fresh key and pipe it straight into Vercel without saving a file, e.g. `gcloud iam service-accounts keys create /dev/stdout --iam-account=ai-ear-hop@perch-bird-poc.iam.gserviceaccount.com | vercel env add AI_EAR_GCP_SERVICE_ACCOUNT_JSON production` (and `preview` if wanted); rotate/delete the key when moving to WIF.
3. Vercel **server-only** env (scope Production/Preview; never `VITE_*`/`NEXT_PUBLIC_*`), names only:
   | Name | Purpose |
   | --- | --- |
   | `AI_EAR_GCP_SERVICE_ACCOUNT_JSON` | credential of `ai-ear-hop` |
   | `AI_EAR_BACKEND_URL` | private Cloud Run service URL (also the ID-token audience) |
   | `AI_EAR_ENABLED` | server switch; `true` only when the E2E on Vercel has passed |
   | `ANALYSIS_CONSENT_SECRET` | must already exist (≥ 32 chars); the consent gate fails closed without it |
4. Vercel function max duration ≥ ~30 s (hop timeout 28 s; Cloud Run cold start ~8 s) and body limit check (client sends < 1 MB; hop cap 4 MB).
5. Preview deploy → run the E2E below against the preview URL with a real test login → real phone.
