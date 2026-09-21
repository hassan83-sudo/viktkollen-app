# BILL-1D — Staging execution results

Branch: `billing-cost-metering-sprint1`  
Target: `BILLING_TEST_TARGET=staging` (preflight already green).  
Production project was not contacted. `.env.local` was read only in-process and is gitignored.

## Staging target

| Check | Result |
|---|---|
| Target label staging | YES |
| URL ref matches `BILLING_TEST_STAGING_PROJECT_REF` | PASS |
| Staging ref ≠ production ref | PASS |
| Staging Auth/REST reachable | YES |
| `BILLING_TEST_DATABASE_URL` / `DATABASE_URL` | NO |

## Migration

**Not applied.** The BILL-1 SQL file needs a Postgres/SQL adapter. Staging publishable + secret keys can call Auth and PostgREST, but not `CREATE SCHEMA` / table DDL.

Tried, then stopped: PostgREST is not a SQL console; `/pg/query` is not available; Management API token is not configured; no staging database URI in `.env.local`.

No `drop database`. No other Viktkollen migrations. No production SQL.

## PostgREST / client roles (live)

These ran against the real staging Data API with synthetic requests only.

| Check | Result |
|---|---|
| anon SELECT/INSERT/UPDATE/DELETE | BLOCKED |
| authenticated SELECT/INSERT/UPDATE/DELETE | BLOCKED |
| cross-user raw SELECT | BLOCKED (clients have no billing schema access) |
| PostgREST raw `billing` access | BLOCKED |

Two temporary staging Auth users were created for JWT tests and then deleted via staging Auth admin. No production Auth.

## SQL / RLS / constraints (not run)

Because no SQL adapter was available:

RLS, grants, append-only trigger, trusted INSERT/UPDATE/DELETE, idempotency, concurrency, negative quantity, unknown unit/type, privacy metadata, allowlisted metadata, indexes, money column types, `occurred_at` lookup — **not executed**.

In the status template those rows are **FAIL meaning not proven**, not that staging allowed a bypass.

## Test data

No `billing.usage_events` rows were inserted (schema not created). Auth test users were removed.

## Remaining risks

- BILL-1 migration is still unapplied on staging and production.
- Client Data API blocking is consistent with an unexposed `billing` schema, but does not prove table RLS/triggers.
- Next run needs a **staging-only** `BILLING_TEST_DATABASE_URL` in `.env.local` (never production). Then re-run `node scripts/run-billing-staging-1d.mjs`.

## Recommendation

**DO NOT APPROVE YET** for production migration.  
**BILL-2: NOT READY**
