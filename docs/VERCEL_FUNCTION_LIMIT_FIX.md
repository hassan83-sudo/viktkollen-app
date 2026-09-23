# VERCEL-FN-2A — Consolidate user billing GET routes

Status: **READY (Preview pending after push)**  
Base: VERCEL-FN-1 `cbc6b7deba3c60f20f6b9724d9d1222ad389f8ab`

No admin merge. No vision merge. No BILL-4C2b. No migration. No production promote.

## Three original routes (unchanged contracts)

| Public URL | Method | Auth | Query | Body | 200 shape | Other status | CORS | Runtime |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/billing/quota` | GET | Supabase Bearer | `feature`, `unit` | none | `{ ok, quota, requestId }` | 401, 405 | none (no `*`) | Node |
| `/api/billing/subscription` | GET | Supabase Bearer | `user_id` must match JWT or omitted | none | `{ ok, subscription, requestId }` | 401, 403 `FORBIDDEN_USER`, 405 | none | Node |
| `/api/entitlements` | GET | Supabase Bearer | ignored for identity | none | `{ ok, entitlement, verification, requestId }` | 401, 405 | none | Node |

Env (names only): `SUPABASE_URL`, `VITE_SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY`; entitlements also `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SERVICE_ROLE` via existing server client.

Shared modules: `verifySupabaseUser`, `inspectServerQuota`, `getServerSubscription`, `mapEntitlementRowToSnapshot`, `createSupabaseAdminClient`. Read-only. No reserve/commit/rollback. No subscription mutation.

All three are **authenticated-user** GET. None are `billing_admin`, webhook, or public.

## New internal architecture

- **One deployable function:** `api/billing/user/index.js`
- **Removed as functions:** `api/billing/quota/index.js`, `api/billing/subscription/index.js`, `api/entitlements/index.js`
- **Still separate:** `api/billing/admin/index.js`

`vercel.json` rewrites preserve public URLs:

- `/api/billing/quota` → `/api/billing/user?__vk_route=quota`
- `/api/billing/subscription` → `/api/billing/user?__vk_route=subscription`
- `/api/entitlements` → `/api/billing/user?__vk_route=entitlements`

Dispatch allowlist is static: public pathname wins; else internal path `/api/billing/user` with `__vk_route` in `{quota,subscription,entitlements}`. Client `op` / `route` / `isAdmin` cannot select admin or arbitrary modules. Unknown → 404. Wrong method on known paths → 405.

Frontend still calls `/api/entitlements` (see `src/services/entitlements.js`).

## Function count

| | |
| --- | --- |
| BEFORE | 13 |
| AFTER | **11** |
| HOBBY LIMIT | 12 |
| MARGIN | **1** |

## Tests

- `api/billing/user/index.test.js` — three public paths, anon, cross-user, unknown, 405, rewrite dest, 11 entrypoints, admin file remains
- Existing entitlements + BILL-3 subscription API tests pointed at the dispatcher
- Billing/auth regressions unchanged for admin

## Risks

- Vercel rewrite must keep query strings (`feature`, `unit`). If Preview 404s on old URLs, inspect rewrite behavior — **do not auto-merge more routes**.
- Internal `/api/billing/user?__vk_route=…` is extra surface with the **same** user GET allowlist, not admin.

## Rollback

Revert this commit. Restore the three `index.js` files. Remove the `rewrites` block from `vercel.json`.
