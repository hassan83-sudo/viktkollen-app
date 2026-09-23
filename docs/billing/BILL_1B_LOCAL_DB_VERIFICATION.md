# BILL-1B — Local database security verification

Branch: `billing-cost-metering-sprint1`  
HEAD at start: `792f5cf` (BILL-1A)  
BILL-1 ancestor: `83a817b`  
`origin/billing-cost-metering-sprint1` matched HEAD.  
`origin/main` remained `c8899a5` (untouched).

**Production: not contacted. No `supabase db push`. No remote SQL. No production URL used.**

## Local environment

Read-only discovery in this worktree / machine session:

| Check | Result |
|---|---|
| `supabase` CLI on PATH | not found |
| `docker` on PATH | not found |
| `psql` / `pg_isready` | not found |
| `supabase/config.toml` (local stack) | absent (repo has SQL files only) |
| Listening ports 5432, 54321, 54322, 54323, 6543 | closed |
| `SUPABASE_URL`, `SUPABASE_DB_URL`, `DATABASE_URL`, `POSTGRES_URL`, `PGHOST`, `PGPORT` | unset |

No install, no Docker start, no system changes, no production connection.

**LOCAL DB AVAILABLE: NO**

Live items 4–22 of the BILL-1B brief were **not executed**. Guessing PASS would violate the sprint.

## Migration applied locally

NO.

The unapplied file remains `supabase/migrations/20260921121500_billing_usage_events.sql`. BILL-1A still documents it as unapplied. This sprint did not apply it anywhere.

Production migration status cannot be proven without querying production (forbidden). Evidence this session did **not** apply it: no CLI, no DB URL, no push, ports closed.

## RLS / grants / role tests

Not executed against PostgreSQL.

| Surface | Result |
|---|---|
| anon SELECT/INSERT/UPDATE/DELETE | NOT TESTED |
| authenticated SELECT/INSERT/UPDATE/DELETE | NOT TESTED |
| cross-user raw SELECT | NOT TESTED |
| service_role SELECT/INSERT/UPDATE/DELETE | NOT TESTED |
| append-only trigger | NOT TESTED |
| idempotency / concurrent insert | NOT TESTED |
| negative quantity / unknown unit / unknown event_type | NOT TESTED |
| privacy metadata reject / allowlisted metadata | NOT TESTED |
| user_id uuid vs null | NOT TESTED |
| PostgREST exposure of `billing` | NOT TESTED |
| live indexes | NOT TESTED |

Static BILL-1A tests still describe the **intended** design (deny-all clients, service_role insert/select, append-only trigger, CHECKs). That is SQL-text review, not local DB proof.

## Remaining risks

- BILL-1A recommendation **DO NOT APPROVE YET** still holds until a **safe local** (or dedicated non-production) Postgres/Supabase exists and the live checklist in `BILL_1A_SECURITY_REVIEW.md` passes.
- Installing Docker/Supabase CLI was out of scope for BILL-1B.
- Persistence remains in-memory at runtime.

## Recommendation

**DO NOT APPROVE YET**  
**BILL-2: NOT READY**

Next: Hassan review. Optionally provide a pre-existing local Supabase that is clearly not production, then re-run BILL-1B live checks. Do not start BILL-2. Do not migrate production.
