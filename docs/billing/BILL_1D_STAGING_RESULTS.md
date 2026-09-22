# BILL-1D — Staging execution results

Branch: `billing-cost-metering-sprint1`
Target: `BILLING_TEST_TARGET=staging` via Session pooler.
Production was not contacted. `.env.local` is gitignored and was not committed.

## Target

| Check | Result |
|---|---|
| Staging API + DB ref match | PASS |
| Staging ≠ production | PASS |
| Session pooler | PASS |
| Pre-mutation abort path | not triggered |

## Migration

Applied **only** `supabase/migrations/20260921121500_billing_usage_events.sql` to staging. No other Viktkollen migrations. Table was absent beforehand.

| Check | Result |
|---|---|
| `billing` schema + `usage_events` | PASS |
| RLS + FORCE RLS | PASS |
| PK `event_id` | PASS |
| quantity / event_type / unit / metadata CHECKs | PASS (live rejects) |
| append-only trigger | PASS |
| indexes `(user_id, occurred_at)`, `(event_type, occurred_at)` | PASS |
| no float money columns | PASS |
| `occurred_at` present on synthetic rows | PASS |

## Live client / Data API

| Check | Result |
|---|---|
| anon SELECT/INSERT/UPDATE/DELETE | BLOCKED |
| authenticated SELECT/INSERT/UPDATE/DELETE | BLOCKED |
| cross-user raw SELECT | BLOCKED |
| PostgREST raw billing | BLOCKED |

Temporary staging Auth users were created for JWT tests and deleted afterward. No production Auth.

## Trusted SQL (staging pooler)

| Check | Result |
|---|---|
| INSERT valid dummy event | PASS |
| UPDATE | BLOCKED |
| DELETE | BLOCKED |
| append-only | PASS |
| duplicate `event_id` | PASS (one row) |
| concurrent same `event_id` | PASS (one row) |
| quantity &lt; 0 | BLOCKED |
| unknown unit / event_type | BLOCKED |
| forbidden metadata keys | BLOCKED |
| allowlisted metadata | PASS |
| uuid / null / invalid `user_id` | PASS / PASS / BLOCKED |

## Test data

Synthetic `bill1d-%` rows left in staging (append-only; trigger was not disabled). Count at end of run: **6**. No real user content.

## Recommendation

**APPROVE FOR SEPARATE PRODUCTION-MIGRATION STEP** — only after Hassan review.
Do **not** apply this SQL to production from this sprint.
**BILL-2:** persistence foundation is ready; do not start BILL-2 here.
