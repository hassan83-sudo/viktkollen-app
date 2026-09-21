# BILL-1E — Production migration (applied)

Branch: `billing-cost-metering-sprint1`  
HEAD: `3d636ef`. `origin/main` remained `c8899a5`.

Connection used **only** gitignored `.env.production.local` (`BILLING_PROD_*`). Staging `.env.local` was **not** used as a production URI; its staging project ref was read only as a deny-list for inequality checks.

## Exact migration

File: `supabase/migrations/20260921121500_billing_usage_events.sql`  
Git blob / `git hash-object`: `13c68b1473f501a48c57ab675eba525b5ee9d9ff`  
Same blob at `e8cba6d:supabase/migrations/20260921121500_billing_usage_events.sql`.  
No other migration files were executed. `supabase db push` was not used.

## Pre-mutation gates

| Check | Result |
|---|---|
| TARGET | PRODUCTION |
| Production ref = database target | PASS |
| Production ref ≠ staging ref | PASS |
| Database target ≠ staging | PASS |
| Connection method | SESSION POOLER |
| Checksum matches BILL-1D staging file | PASS |
| Exact file only | YES |
| `.env.production.local` gitignored | YES |

## Collision (read-only, before apply)

| Check | Result |
|---|---|
| Pre-existing `billing` schema | NO |
| Pre-existing `billing.usage_events` | NO |
| Unexpected name collisions | none |
| Already applied | NO |
| Collision check | PASS |

## Recovery (read-only; backup config unchanged)

WAL archiving is active (`archive_mode=on`, `wal_level=logical`, archived WAL present, no archive failure). Primary is not in recovery. Supabase PITR add-on / restore window was **not** checked via Management API. No restore procedure was invented or executed.

**RECOVERY PATH: VERIFIED** (WAL archive). PITR dashboard: not checked.

## Apply

Human-approved SQL only, in a single transaction: **COMMITTED**.
On this run there was no SQL error and no rollback.

No usage events, test users, dummy rows, AI calls, GPS events, or provider prices were written. Row count after apply: **0**.

## Post-migration (read-only catalog)

| Check | Result |
|---|---|
| `billing` schema | PASS |
| `usage_events` table | PASS |
| RLS enabled + FORCE | PASS |
| anon / authenticated raw table privileges | BLOCKED |
| `service_role` USAGE + SELECT + INSERT; no UPDATE/DELETE | PASS |
| append-only trigger `usage_events_append_only` | PASS |
| PK `event_id` | PASS |
| quantity / event_type / unit CHECKs | PASS |
| metadata allowlist CHECKs | PASS |
| index `(user_id, occurred_at)` | PASS |

PostgREST HTTP was not exercised (no production API keys in the production env file). Privilege catalog is the source for anon/authenticated BLOCKED.

## Unchanged

No BILL-2. No Vercel. No main merge. Staging was not mutated. Backup settings were not changed.
