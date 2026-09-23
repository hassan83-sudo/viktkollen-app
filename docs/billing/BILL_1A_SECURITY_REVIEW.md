# BILL-1A — Usage migration security review

Branch: `billing-cost-metering-sprint1`  
BILL-1 base: `83a817b`  
Migration file: `supabase/migrations/20260921121500_billing_usage_events.sql`  
**Production migration was not executed. Supabase production was not changed.**

Runtime BILL-1 still uses the in-memory usage repository. This review hardens the **unapplied** local SQL so a later approved apply cannot make the logged-in client authoritative for billing usage.

## Migration reviewed

YES. Original BILL-1 SQL already intended deny-all client access (`billing` schema, revoke from `anon`/`authenticated`, FORCE RLS, restrictive `USING/CHECK false`). BILL-1A found remaining holes and corrected the **same** local file (not a follow-up migration):

| Gap in original SQL | Local correction |
|---|---|
| Unrestricted `jsonb` metadata (service-role insert could store prompt/audio/GPS/secrets) | CHECK: object only; remaining keys after allowlist subtraction must be `{}`; numeric keys must be non-negative integers; `usage_basis` enum |
| Free-text `event_type` / `unit` / `cost_basis` | Closed CHECK lists matching BILL-1 catalog (new types need a later ALTER) |
| No length bounds on ids / provider / model | `char_length` CHECKs (180 / 80) |
| Redundant unique index on PK `event_id` | Dropped; PK is the uniqueness |
| No `(event_type, occurred_at)` index | Added for future type+period aggregates |
| `occurred_at` required with no default | `default now()` so server omit still has an economic timestamp |
| No table GRANT to `service_role` | `SELECT, INSERT` only |
| No append-only enforcement after grants | `BEFORE UPDATE OR DELETE` trigger; `REVOKE UPDATE, DELETE` including `service_role` |
| No SECURITY DEFINER RPC | None added — trusted server insert is simpler |

## Tables

- `billing.usage_events` in schema `billing` (not `public`).
- No cost-catalog table (catalog remains application fixtures/code). Clients cannot edit prices, FX, or effective dates.

## Columns

| Column | Type | Notes |
|---|---|---|
| `event_id` | `text` PK | Server request id; 1–180 chars |
| `reference_id` | `text` NOT NULL | 1–180 |
| `user_id` | `uuid` NULL | Server-derived; null if unknown / non-uuid |
| `event_type` | `text` NOT NULL | CHECK known BILL-1 types |
| `feature` | `text` NOT NULL | 1–80 |
| `provider` | `text` NOT NULL default `''` | ≤80; no secrets |
| `model` | `text` NOT NULL default `''` | ≤80 |
| `unit` | `text` NOT NULL | CHECK known units |
| `quantity` | `integer` NOT NULL | `>= 0` and `<= 1e9` |
| `occurred_at` | `timestamptz` NOT NULL default `now()` | **Economic** timestamp for catalog lookup |
| `cost_basis` | `text` NOT NULL default `UNAVAILABLE` | `ESTIMATED` \| `UNAVAILABLE` |
| `metadata` | `jsonb` NOT NULL default `{}` | Allowlisted keys only |
| `created_at` | `timestamptz` NOT NULL default `now()` | Insert time, not price window |

No `payload`, `context`, `prompt`, `response`, money, or floating-point columns.

## Constraints

- PK / uniqueness: `event_id` (global).
- Quantity non-negative integer.
- Known `event_type`, `unit`, `cost_basis`.
- Metadata allowlist + value types.
- Length limits.

**Idempotency scope:** global `event_id`. BILL-1 ids are per provider **request**, not per user. Duplicate retries of the same request share one row. Unrelated users do not collide unless they share a request id (then the second write is a duplicate, which is correct).

## RLS

- `ENABLE ROW LEVEL SECURITY`
- `FORCE ROW LEVEL SECURITY`
- Restrictive policy `"No direct client access to usage events"` `FOR ALL TO public USING (false) WITH CHECK (false)`
- Schema and table privileges revoked from `public`, `anon`, `authenticated`

Supabase `service_role` typically bypasses RLS; table grants + append-only trigger are the write path.

## SELECT / INSERT / UPDATE / DELETE

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `anon` | none | none | none | none |
| `authenticated` (normal logged-in client) | none | none | none | none |
| `public` | none | none | none | none |
| `service_role` (server env only) | yes | yes | revoked + trigger | revoked + trigger |

Normal users do **not** get raw usage SELECT. Future user-facing usage UI should use a server aggregate/RPC designed later — not this table via PostgREST. Admin comes later.

No client-authoritative INSERT of quantity / provider / model / user_id.

## Privacy schema

Allowlisted metadata keys: `cached_tokens`, `image_count`, `input_tokens`, `output_tokens`, `total_tokens`, `usage_basis`.

Rejected (application allowlist + DB key subtraction): prompt, response, chat text, transcript, audio, audio URL, image, image URL, GPS/coordinates, password, auth token, API key, card number, CVV.

Application `sanitizeUsageMetadata` / `toPersistedUsageRow` drop unknown fields; SQL CHECK rejects extra keys if a future insert skips the app layer.

**Unrestricted metadata/payload: NO** (jsonb exists but is constrained).

## Server authority

Authoritative events are produced in API (`recordOpenAiGatewayUsage` → `recordUsageEvent`) with server `requestId`, `provider: 'openai'`, `quantity: 1`. Persistence to Postgres is **not yet wired**. When wired:

- Use `createSupabaseAdminClient()` (`SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SERVICE_ROLE`, never `VITE_*`).
- Set `user_id` from verified auth (`toPersistedUsageRow` nulls non-uuid).
- Treat unique-violation on `event_id` as duplicate success (fail-open, no user-facing error).
- Do not accept client bodies as quantity/provider/model/user_id for billing writes.

No SECURITY DEFINER function was added.

## Service-role exposure

- Client: `src/services/supabaseClient.js` uses `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` only.
- Server: `api/_shared/supabaseServer.js` reads service role from non-Vite env.
- `.env.example` documents `SUPABASE_SERVICE_ROLE_KEY=` (empty). No real secret committed.
- Vite define list does not include service role.

## Indexes / scale

- `(user_id, occurred_at desc)` — user + period (BILL-2 aggregates / future quota) without full table scan.
- `(event_type, occurred_at desc)` — type + period.
- PK lookup for idempotency.

50k-user foundation: **partial-to-pass**. Indexes support keyed lookups; quota engine is **not** built. BILL-2 can sum by `user_id` + `occurred_at` range from a trusted server.

## Historical pricing

`occurred_at` + in-code catalog `effective_from` / `effective_to`. No money in the usage row (integer minor units stay in catalog/estimators). BILL-1 catalog was not changed.

## Fail-open / retries

`recordUsageEvent` never throws to the AI caller. Invalid/sensitive input returns `{ ok: false }` without logging bodies. Duplicate `event_id` is success without a second row. DB PK is the race/retry backstop once persistence is wired. No infinite retry loop in metering.

## Retention

Not defined. Usage rows are economic/technical metadata; a later retention/privacy policy and trusted delete path are required. The append-only trigger must be replaced for GDPR erasure. This is **not** a permanent-storage policy.

## Event type / unit decision

Closed CHECKs matching BILL-1 lists. Adding a type/unit requires a migration `ALTER ... DROP/ADD CONSTRAINT`. Cheaper mistakes (unknown units becoming billable) are worse than an ALTER.

## Local / static tests

`src/services/billing/billingMigration.security.test.js` plus existing `billing.test.js`:

- Negative quantity blocked (app + SQL text)
- Duplicate event_id (in-memory)
- Sensitive/unknown metadata dropped
- Non-uuid user_id → null for SQL row
- SQL revoke/RLS/grants/append-only/allowlist/indexes
- No service role in client env surface

## Tests requiring real/local Supabase (REQUIRED BEFORE MIGRATION APPROVAL)

Do **not** guess PASS. Live checks were **not** run (no local/production DB apply):

1. As `anon` JWT: SELECT/INSERT/UPDATE/DELETE on `billing.usage_events` fail (privilege or RLS).
2. As `authenticated` JWT: same, including forged `user_id` and huge `quantity`.
3. Cross-user: user A cannot SELECT user B rows (no SELECT grant).
4. `service_role`: INSERT allowed; UPDATE/DELETE raise append-only (or privilege denied).
5. Concurrent INSERT same `event_id`: one row.
6. INSERT `quantity = -1` / unknown `unit` / metadata `{prompt: ...}` rejected by CHECK.
7. PostgREST schema `billing` not exposed to the anon key.

## Changes made

- Hardened `supabase/migrations/20260921121500_billing_usage_events.sql` (original unapplied file).
- `toPersistedUsageRow` in `src/services/billing/usageEvent.js` (uuid-only `user_id` for future SQL).
- Static security tests.
- This report.

## Remaining risks

- Persistence not wired; production still has no usage table (in-memory only).
- Live RLS/grant tests not executed.
- `service_role` can INSERT for any `user_id` (trusted path). Compromised server env = forged usage. Protect the key.
- `user_id` nullable: anonymous gateway usage cannot be attributed until auth is passed through.
- Closed CHECKs need a migration for new event types.
- GDPR delete needs a later admin path.
- BILL-1 `recordOpenAiGatewayUsage` still accepts `userId` from the API caller; wiring must use verified auth, not a request-body user id.

## Recommendation

**DO NOT APPROVE YET**

Approve the SQL only after Hassan review **and** the live Supabase checklist above. Do not `supabase db push`, do not migrate production, do not start BILL-2.
