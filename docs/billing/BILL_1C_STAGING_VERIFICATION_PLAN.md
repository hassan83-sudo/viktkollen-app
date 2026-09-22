# BILL-1C — Safe Supabase staging verification plan

Branch: `billing-cost-metering-sprint1`  
Bases: BILL-1 `83a817b`, BILL-1A `792f5cf`, BILL-1B `6e9d2cb`.

**This sprint does not create a Supabase project, does not apply SQL, and does not touch production.**

## Why staging is required

BILL-1B found no local Postgres/Docker/Supabase CLI. BILL-1A therefore still has **SQL-text** proof only. Approving `20260921121500_billing_usage_events.sql` needs a **non-production** database where anon/authenticated/service_role can be exercised for real.

Viktkollen production must never be that database.

## Production project identity

**PRODUCTION PROJECT IDENTIFIED: UNKNOWN**

This repository does not contain a production Supabase hostname or project-ref (no `*.supabase.co` URLs in tracked docs/code except test placeholders). The harness therefore **refuses** any `*.supabase.co` target unless:

1. `BILLING_TEST_TARGET` is `staging` or `test`
2. `BILLING_TEST_STAGING_PROJECT_REF` **exactly matches** the URL ref
3. That ref is **not** listed in `BILLING_TEST_PRODUCTION_PROJECT_REF` (comma-separated allow-deny list Hassan can set once production ref is known)

Localhost (`http://127.0.0.1:54321`) is allowed only with `BILLING_TEST_TARGET=local`.

Hassan: when the production ref is known, set it locally as `BILLING_TEST_PRODUCTION_PROJECT_REF=<ref>` so a mistaken paste of the production URL aborts before SQL.

## Environment (placeholders only)

Server-side / test process only. Never `VITE_`. Never the client bundle.

| Name | Required | Purpose |
|---|---|---|
| `BILLING_TEST_SUPABASE_URL` | yes | Staging or local API URL |
| `BILLING_TEST_SUPABASE_ANON_KEY` | yes | Anon JWT tests (PostgREST) |
| `BILLING_TEST_TARGET` | yes | `staging` \| `test` \| `local` |
| `BILLING_TEST_STAGING_PROJECT_REF` | yes for `*.supabase.co` | Must match URL project ref |
| `BILLING_TEST_PRODUCTION_PROJECT_REF` | recommended | Deny-list of production ref(s) |
| `BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY` | yes for trusted tests | INSERT + SELECT; UPDATE/DELETE must still fail |

`.env.example` lists empty names. `.gitignore` ignores `.env`, `.env.local`, `.env.*.local`, `.env.staging`, `.env.billing*`.

Dry-run (no mutation):

```
npm run billing:staging-preflight
```

Expected without env: abort, `TARGET VALIDATED: NO`, `MIGRATION: NOT EXECUTED`.

## Production guard

`src/services/billing/stagingVerification.js` validates **before** any `executeSql`. Failures: missing env, malformed URL, wrong target label, production ref match, staging ref mismatch, `VITE_` billing keys.

No `drop database`, no project reset, no deletes outside `billing.usage_events` test rows.

## Migration process (not executed in BILL-1C)

File: `supabase/migrations/20260921121500_billing_usage_events.sql`

After Hassan creates/selects a **separate** staging project and confirms it is not production:

1. Put only `BILLING_TEST_*` in `.env.local` (gitignored).
2. Run `npm run billing:staging-preflight` until `READY FOR HUMAN-APPROVED STAGING RUN: YES`.
3. **Stop.** Apply SQL only after a later explicit approval (BILL-1D), in the staging SQL editor or a staging-only DB URL — never `supabase db push` to production.
4. Apply adapter in code requires `applyMigration: true` **and** `humanApproved: true`. Default CLI is dry-run only.

## Test matrix (prepared, not run against a live DB)

See `INTEGRATION_MATRIX` in `stagingVerification.js`.

| Area | Expected |
|---|---|
| anon SELECT/INSERT/UPDATE/DELETE | blocked |
| authenticated SELECT/INSERT/UPDATE/DELETE | blocked |
| service_role INSERT + SELECT | pass |
| service_role UPDATE/DELETE | blocked (grants + append-only trigger) |
| second INSERT same `event_id` | conflict, one row |
| concurrent same `event_id` | one row |
| quantity &lt; 0, unknown unit, unknown event_type | blocked |
| forbidden metadata keys | blocked |
| allowlisted metadata (`input_tokens`, …) | pass |
| user A raw SELECT of user B | blocked (raw SELECT denied for clients) |
| PostgREST `billing` schema | not exposed to anon/authenticated |

Dummy data only. Prefix test `event_id` with `bill1c-`.

## Test users

**Not created in BILL-1C.** Later, in staging Auth only: two users A/B for JWT REST. Production auth is forbidden. Cross-user is still expected to fail because clients have no SELECT on `billing.usage_events`.

## Service role

Read from `process.env.BILLING_TEST_SUPABASE_SERVICE_ROLE_KEY` in the test process. Reports redact values. Never log, snapshot, commit, or `VITE_`-prefix the key. Missing key → trusted cases do not run; no SQL.

## Cleanup (staging only, later)

Application roles cannot DELETE (append-only). Teardown must be a **staging-only** admin path, for example temporarily disable `usage_events_append_only`, `DELETE FROM billing.usage_events WHERE event_id LIKE 'bill1c-%'`, re-enable trigger. Never production. Never drop other schemas.

## PASS criteria for a future human-approved staging run

- Preflight `TARGET VALIDATED: YES` and production block PASS
- Migration applied **only** on the staging/local target
- Full matrix above green
- No secrets in logs
- Production project unchanged

## What Hassan does next

1. Create or select a **separate** Supabase project (not Viktkollen production).
2. Copy its URL, anon key, service role into **local gitignored** env as `BILLING_TEST_*`.
3. Set `BILLING_TEST_TARGET=staging` and `BILLING_TEST_STAGING_PROJECT_REF` to that project ref.
4. Set `BILLING_TEST_PRODUCTION_PROJECT_REF` when the production ref is known.
5. Run `npm run billing:staging-preflight`.
6. Wait for explicit BILL-1D approval before applying SQL.

Do not start BILL-1D, BILL-2, or production migration from this sprint.
