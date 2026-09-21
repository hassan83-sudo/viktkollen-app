# BILL-1E — Production migration (stopped before apply)

Branch: `billing-cost-metering-sprint1`  
HEAD: `e8cba6d` (BILL-1D). Origin matched. `origin/main` remained `c8899a5`.

**Production SQL was not executed.** Staging `.env.local` was not used as a production connection.

## Exact migration

File: `supabase/migrations/20260921121500_billing_usage_events.sql`  
Git blob / `git hash-object`: `13c68b1473f501a48c57ab675eba525b5ee9d9ff`  
Same blob at `e8cba6d:supabase/migrations/20260921121500_billing_usage_events.sql`.  
`git diff e8cba6d --` that file: empty. **Checksum matches the BILL-1D staging file.**

## Production target

`BILLING_TEST_PRODUCTION_PROJECT_REF` exists only as a **deny-list** inside staging `.env.local`. That is not a production connection string.

No separate production credential source was present:

| Source | Result |
|---|---|
| `BILLING_PROD_DATABASE_URL` process env | unset |
| `PRODUCTION_DATABASE_URL` | unset |
| `BILLING_PRODUCTION_DATABASE_URL` | unset |
| `SUPABASE_PRODUCTION_DB_URL` | unset |
| `PROD_DATABASE_URL` | unset |
| `.env.production.local` / other prod env files | absent |
| `BILLING_TEST_DATABASE_URL` | **not used** (staging Session pooler) |

**PRODUCTION TARGET VERIFIED: NO**  
**PRODUCTION CREDENTIAL SOURCE: MISSING**

## What Hassan needs (placeholders only)

A **separate** gitignored file, for example `.env.production.local`, not `.env.local`:

```
BILLING_PROD_TARGET=production
BILLING_PROD_PROJECT_REF=
BILLING_PROD_DATABASE_URL=
```

Rules:

- `BILLING_PROD_PROJECT_REF` must equal the production project ref (the one already used as the staging deny-list).
- `BILLING_PROD_DATABASE_URL` must be the **production** Session pooler URI (IPv4), user `postgres.<production-ref>`.
- It must **not** be the staging URI, staging password, or staging API keys.
- Do not put these values in git or in chat.

After that file exists, BILL-1E can be re-run with the same hard guards.

## Recovery path

**UNKNOWN.** No production Management/API access was used. Do not change backup settings.

## Collision / pre-existing schema / apply

Not run (no production DB session).

## Transaction / PostgREST / row count / RLS

Not run.

## Unchanged

No production schema mutation. No test rows. No Auth users. No cost catalog. No Vercel. No main merge. Staging was not mutated in this sprint.

## Recommendation

**DO NOT APPLY** until a separate production Session pooler URI is provided. Then re-run BILL-1E only.
