# BILL-4B — Staging live feature + provider controls

Branch: `billing-cost-metering-sprint1`
Base security: `b97ac132be7abc6cb92f5bf59c476e2446e86faa`
Migration: `supabase/migrations/20260921230000_billing_feature_controls.sql`
**Checksum (`git hash-object`): `cf9a6b2a0ed55c8e925ea12a9747b23aaa3011b7`**

Target: staging Session pooler from gitignored `.env.local` only.
`.env.production.local` was not used. Production was not contacted.
`BILLING_TEST_TARGET=staging`; staging project ref matched the pooler user; staging ref ≠ production ref.

Apply: **COMMITTED** in one transaction. BILL-1/2/3/4A present; BILL-4B tables/RPCs absent beforehand (`COLLISION_CHECK: PASS`). No db reset. No other migration. No OpenAI / AI Ear calls. No quota consume. No subscription mutation.

## Schema created

Tables: `billing.feature_controls`, `billing.provider_controls`.

Functions: `set_feature_control`, `set_provider_control`, `guard_feature_control_row`, `guard_provider_control_row`; replaced `append_admin_audit` / `admin_audit_snapshot`.

RLS + FORCE RLS on both control tables. `service_role` SELECT only; mutations via SECURITY DEFINER. `append_admin_audit` EXECUTE not granted to `service_role`. PUBLIC/anon/authenticated EXECUTE revoked.

Indexes: `feature_controls_pkey`, `provider_controls_pkey`, plus BILL-4A audit indexes still present.

## Live CAS

| Check | Result |
| --- | --- |
| Feature create `ready_avatar` v1 + 1 audit | PASS |
| Feature update expected 1 → v2 + 1 audit | PASS |
| Feature stale expected 1 | CONFIG_CONFLICT; version 2; no extra change audit |
| Two real `pg.Client` feature update `gps_standard` expected 1 | **YES**; **SUCCESSFUL FEATURE UPDATES: 1**; other CONFIG_CONFLICT; final v2 |
| Feature concurrent first create `friend_chat` | PASS; one row |
| Provider create `openai` v1 + 1 audit | PASS |
| Provider update expected 1 → v2 + 1 audit | PASS |
| Provider stale expected 1 | CONFIG_CONFLICT |
| Two real `pg.Client` provider update `openai` expected 2 | **YES**; **SUCCESSFUL PROVIDER UPDATES: 1**; final v3 |
| Provider concurrent first create `google.cloud_run.ai_ear` | PASS; one row |
| DB CAS authority | YES (not a JS mutex) |
| Global lock | NO |

## Security / resolver

anon/authenticated raw CRUD BLOCKED (including PostgREST RPC). Normal user `set_*` BLOCKED. Body `isAdmin` spoof BLOCKED. `updated_by` / `updated_at` server/DB. Audit UPDATE/DELETE BLOCKED. Dummy secret keys rejected. Unknown feature/provider/mode/reason BLOCKED. Control DELETE blocked.

Operational resolver (no provider HTTP): feature DISABLED wins; MAINTENANCE wins over provider down; openai UNAVAILABLE → PROVIDER_UNAVAILABLE; MAINTENANCE → PROVIDER_MAINTENANCE; `tts.request` AVAILABLE during openai outage; known no-row defaults AVAILABLE; unknown feature/provider fail-safe. Emergency: new decisions deny; in-flight calls not aborted (not invoked).

## Leftovers (staging only)

Synthetic Auth users `bill4b-*@invalid.example`. One ACTIVE staging `billing_admin`. Feature/provider control rows for the tested IDs. Append-only audit leftovers **left in place**. No production admin.

## Recommendation

**APPROVE FOR SEPARATE PRODUCTION STEP** after Hassan review of checksum `cf9a6b2a0ed55c8e925ea12a9747b23aaa3011b7`.
Do not apply to production from this sprint. Do not start BILL-4C. Do not bootstrap production `billing_admin`.
