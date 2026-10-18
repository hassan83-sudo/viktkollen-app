# Production: Security Center 503 and AI Help 502

## Read-only evidence

Vercel project `viktkollen-app`, team `appsonthego-s-projects`, environment
`production`. Request records for deployment
`dpl_67gPCepYpKTTzKBGDQjtmhRdEoCy` show:

- `GET /api/security-center`: HTTP 503, including 2026-10-18 10:47:24 UTC.
- `POST /api/ai-help`: HTTP 502 at 2026-10-18 10:36:17 UTC,
  request `x6tv4-1792319777181-6279f0a1cb2b`.

Runtime logs in the available retention window did not contain a provider
response diagnostic for that 502. The `url.parse()` deprecation warning is
not evidence of its cause. The precise provider failure (invalid JSON,
incomplete output, invalid contract, or empty answer) remains unproven.
No customer prompts, model output, credentials or tokens were retrieved.

Read-only catalog queries in Production Supabase `bxmdlckrlwzdtcxnsqqr`
confirmed that the `security_center` schema, events table, both public RPC
bridges and all three Security Center migration history entries are absent.
The handler cannot read a missing RPC and correctly fails closed with 503.
No application-only change can install these database dependencies.

## Prepared code correction

AI Help previously returned 502 for every invalid model response, including
questions for which an existing verified fallback was already available.
It now reuses the same verified customer answer or Swedish catalog fallback
used when the model budget is unavailable. It never uses partial model text,
retries the paid call, raises the 400-token cap, releases an uncertain charge,
or records a provider failure as a knowledge gap. Without a suitable fallback
(including non-Swedish catalog requests), it still returns an honest 502.

Fixed-category server warnings distinguish invalid JSON, incomplete output,
invalid contract and empty answers. Security Center distinguishes a missing
RPC from other store failures. These logs contain no database error text,
request bodies, provider output, user identifiers or credentials.

## Required Production action — NOT performed

After separate explicit approval, install only the existing Security Center
migrations in this order, recording their original versions in migration
history. Do not run an unfiltered migration push: unrelated pending migrations
must not be included.

1. `20261017134129_security_center_events.sql`
2. `20261017135308_security_center_rpc_bridge.sql`
3. `20261017151943_security_center_event_aggregation.sql`

The bridge depends on the first migration; aggregation depends on both and
replaces the bridge signature. These files already exist in the repository;
this PR does not duplicate, rename or edit them. They operate on the private
Security Center event ledger, not customer or payment tables. Aggregation
includes event retention and must not be executed speculatively against an
existing ledger. Recheck migration history at execution time to avoid races.
No Exposed Schemas or environment-variable changes are required: public
bridges are service-role-only, and the private schema remains unexposed.

After the separately approved database installation, verify service-role RPC
access, denied anon/authenticated direct access and an authenticated admin
HTTP read. Do not create a synthetic Production event. This PR has not claimed
that Production is repaired or that a live authenticated retest has passed.

## Validation

- 63 focused tests passed across AI Help service, HTTP authentication,
  customer context, Security Center handler and migration ordering/privileges.
- Tests cover all four invalid-provider fallback branches, one paid call,
  retained uncertain reservations, no leaked private data, preserved 502 when
  no language-appropriate fallback exists, and missing-RPC safe logging.
- Targeted ESLint and `git diff --check` passed.
- `npm run build` passed (existing large-chunk warning).

No Production writes, migrations, configuration changes or deployments were
performed. No new feature, account, role change or payment action was added.
