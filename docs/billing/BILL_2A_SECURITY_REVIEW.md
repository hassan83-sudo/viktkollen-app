# BILL-2A — Plan/quota migration security review

Branch: `billing-cost-metering-sprint1`
HEAD / origin: `ef20b6353332ca3609bf3e9abe0ac593ab462452` (BILL-2).
`origin/main`: `c8899a5` (unchanged).
Migration reviewed: `supabase/migrations/20260921180000_billing_plan_quota.sql` 
**This SQL was not applied. Staging and production were not contacted.**

BILL-1 production still has only the BILL-1E `billing.usage_events` schema. BILL-1D staging apply of usage events is unchanged by this sprint. BILL-3 was not started.

Runtime BILL-2 tests use a **shared** in-memory atomic backend. Production quota authority is the unapplied SQL functions + `SELECT FOR UPDATE`. Node `asyncMutex` is not the security boundary.

## Verdict

| Gate | Result |
|---|---|
| Client PostgREST (anon / authenticated) vs these tables | **PASS** (FORCE RLS deny-all + revoke) |
| SQL atomic reserve (FOR UPDATE in one function) | **PASS locally — unapplied** |
| SQL reservation state machine | **PASS locally — unapplied** |
| In-memory mutex sufficient for multi-instance | **NO** (isolated backends still overconsume; that is expected) |
| Apply to staging/production now | **DO NOT APPLY** |

## Local SQL fix (unapplied)

Same file `20260921180000_billing_plan_quota.sql` (not a follow-up migration). Still not executed on staging/production.

| Former blocker | Local change |
|---|---|
| In-process mutex only | `quota_period_locks` + `SELECT FOR UPDATE` inside `billing.reserve_quota` (one transaction) |
| No state machine | `quota_reservation_guard`: insert PENDING only; terminal states immutable |
| Empty catalog | Seed PRELIMINARY plans/entitlements matching JS |
| No FK on reservation plan_id | `plan_id` references `billing.plans` |

EXECUTE on reserve/commit/rollback: `service_role` only. PUBLIC/anon/authenticated: none. Functions use `SECURITY DEFINER` + `SET search_path = pg_catalog, pg_temp` and schema-qualified `billing.*`. User id is an argument from the trusted API (JWT), not from PostgREST as the caller’s chosen victim.

**Still do not apply** until a BILL-2 staging sprint wires `createPostgresQuotaBackend` and runs a live two-session race.

## SQL vs implementation

| Contract | App | SQL | Match |
|---|---|---|---|
| Plan ids / prices | `planCatalog.js` (JS seed, PRELIMINARY öre) | `billing.plans` columns; **no seed rows** | Structure yes; runtime does not read SQL |
| Limit | `{ kind: NUMBER\|UNLIMITED, value }` | `limit_kind` + `limit_value` NULL iff UNLIMITED | Yes |
| Units | BILL-1 `USAGE_UNITS` | same CHECK lists | Yes |
| Reservation states | `PENDING`, `COMMITTED`, `ROLLED_BACK`, `EXPIRED` | same CHECK | Yes (not named `active`) |
| Periods | JS UTC `day`/`week`/`month` | stored `period_start`/`period_end` only | Period math is **not** in SQL |
| Feature ids | closed `BILLING_FEATURES` | `feature text` length 1–80, **no closed list** | Weaker in SQL |
| `plan_id` on reservations | copied from assignment | **no FK** to `billing.plans` | Gap |
| Authority | JS ignores `clientClaim`; GET `/api/billing/quota` uses JWT `user.id` | tables not wired | Client HTTP cannot write tables; engine is not Postgres |

GET quota does not accept body `plan_id`. `reserveServerQuota` exists in `_shared` but is **not** an HTTP route. `createQuotaEngine()` is a per-instance singleton over Maps.

## Threat model (normal user)

| Attack | Client / PostgREST | Current JS engine |
|---|---|---|
| DevTools / localStorage plan, unlimited, limit, used, remaining | Ignored if they only call GET quota | `inspectQuota` / `reserveQuota` ignore `clientClaim` |
| Direct Supabase on `billing.*` | Denied (no grants + FORCE RLS using false) | N/A |
| Request body plan_id / unlimited | GET has no body; user from JWT | Must stay that way if POST is added |
| Create reservation / commit / rollback via Data API | No INSERT/UPDATE | In-memory only; not shared across instances |
| Other user’s reservation | No SELECT | Knowing `reservation_id` in-process could commit/rollback that row (no owner check vs caller). HTTP does not expose commit yet. |
| Client clock | Ignored (`now()` server) | PASS in tests |
| Read others’ quota via PostgREST | Denied | GET inspects only authenticated user |

**service_role** bypasses RLS (Supabase). Anyone with that key can INSERT/UPDATE plans, entitlements, assignments, and reservations. That key must stay server-only (`supabaseClient.js` uses `VITE_SUPABASE_ANON_KEY` only). There is no payment-card schema.

## Tables (exact, from this file)

### `billing.plans`

- **Purpose:** Plan catalog (name, integer `price_minor`, interval, version, preliminary status).
- **PK:** `plan_id` text
- **FK:** none
- **Unique:** PK only
- **CHECK:** id/name length; `price_minor` 0..1e9; `currency in ('SEK')`; `billing_interval in ('day','week','month')`; `version >= 1`; `price_status in ('PRELIMINARY','ADMIN-CONFIGURABLE')`
- **RLS:** ENABLE + FORCE; restrictive `FOR ALL TO public USING (false) WITH CHECK (false)`
- **Grants:** `service_role` SELECT, INSERT, UPDATE; DELETE revoked including service_role; none for `anon`/`authenticated`/`public`
- **Indexes:** PK only

### `billing.plan_entitlements`

- **Purpose:** Per-plan feature enabled/limit/unit.
- **PK:** `(plan_id, feature)`
- **FK:** `plan_id` → `billing.plans(plan_id)`
- **Unique:** PK
- **CHECK:** feature length; `limit_kind in ('NUMBER','UNLIMITED')`; UNLIMITED ⇒ `limit_value IS NULL`; NUMBER ⇒ `limit_value` 0..1e9; unit ∈ BILL-1 units; `quota_status in ('PRELIMINARY','ADMIN-CONFIGURABLE')`
- **RLS / grants:** same pattern as plans (FORCE deny-all; service_role SELECT/INSERT/UPDATE; no DELETE)
- **Indexes:** PK only

### `billing.user_plan_assignments`

- **Purpose:** Server assignment user → plan (+ version, source).
- **PK:** `user_id` uuid
- **FK:** `plan_id` → `billing.plans(plan_id)`. No FK to `auth.users`.
- **Unique:** PK (one row per user)
- **CHECK:** `source in ('server','server-default','admin-seed')`; `plan_version >= 1`
- **RLS / grants:** same deny-all + service_role SELECT/INSERT/UPDATE
- **Indexes:** PK only

### `billing.quota_reservations`

- **Purpose:** Quota reservation rows (no prompts/audio/GPS/payment columns).
- **PK:** `reservation_id` text
- **FK:** **none** (`plan_id` is unconstrained text)
- **Unique:** PK only. No unique `(user_id, feature, period)` or exclusion on remaining.
- **CHECK:** id/feature length; quantity/actual/overage bounds; unit list; `status in ('PENDING','COMMITTED','ROLLED_BACK','EXPIRED')`; `plan_version >= 1`
- **RLS / grants:** same deny-all; service_role SELECT/INSERT/UPDATE; no DELETE
- **Indexes:** PK + `quota_reservations_user_feature_period_idx (user_id, feature, period_start, status)`
- **Trigger:** `quota_reservations_immutable` BEFORE UPDATE — blocks changes to identity columns (`reservation_id`, `user_id`, `feature`, `quantity`, `unit`, `plan_id`, `plan_version`, period bounds, `created_at`). **Does not restrict `status` / `actual_quantity` transitions.**

`billing.usage_events` is **not** altered.

## Plans / entitlements / assignment (client)

A normal JWT user **cannot** INSERT/UPDATE/DELETE plans, entitlements, or assignments via PostgREST. They cannot set `price_minor`, activate a plan, grant UNLIMITED, or assign `plan.prelim.sek.month.99` through the Data API.

They also cannot do that through GET `/api/billing/quota`. Assignment in JS defaults to `plan.free` in a process-local Map — **not** this table until wired.

## Reservation states

SQL/app names (not `active`):

- `PENDING` — held quantity (engine “active” hold)
- `COMMITTED`
- `ROLLED_BACK`
- `EXPIRED` — allowed by CHECK; engine treats expired PENDING as not counting, but **does not persist** EXPIRED in JS

Invalid status strings fail CHECK. Dangerous transitions **`COMMITTED → PENDING`**, **`ROLLED_BACK → PENDING`**, **`COMMITTED → ROLLED_BACK`** are **not** blocked in SQL. `service_role` UPDATE can restore quota if the app (or a leaked key) writes those statuses. In-memory `replace()` is equally unconstrained.

App commit/rollback **logic** is idempotent for a single process (second commit/rollback no extra consume). SQL does not encode that.

## Race / serverless (blocker)

`createAsyncMutex` chains Promises **inside one Node isolate**. Two Vercel/serverless instances, or two processes, do not share it.

SQL insert of two `PENDING` rows for the same user/feature/period has **no** `SELECT … FOR UPDATE` of assignment/entitlement, **no** remaining CHECK, **no** deferred constraint, **no** advisory lock, **no** unique “one pending unit” rule. `limit = 1` + concurrent A and B can both INSERT `quantity = 1`.

**In-memory mutex is not production quota authority.** Applying this file does not fix that.

## Other gaps (not client PostgREST)

1. Plans/entitlements not seeded; engine will not use SQL even after apply until a later wiring sprint.
2. No reservation state-machine trigger.
3. No FK `quota_reservations.plan_id`.
4. Feature not restricted to BILL-1 ids in SQL.
5. `commitReservation` / `rollbackReservation` do not verify caller `user_id` (OK while not HTTP-exposed; required before a public mutate API).
6. GET quota engine is per-instance memory — remaining is **not** BILL-1 production usage and **not** these tables.

## Recommendation

**DO NOT APPLY** `20260921180000_billing_plan_quota.sql` to staging or production until a follow-up (not BILL-3 payments) adds at least:

1. Transactional reserve (one statement/transaction that cannot over-consume remaining).
2. Trigger: `PENDING → COMMITTED|ROLLED_BACK|EXPIRED` only; never back to `PENDING`; never `COMMITTED → ROLLED_BACK`.
3. Immutable `actual_quantity` after `COMMITTED`.

Client deny-all RLS is the right shape and can stay. Do not treat BILL-2 JS tests as multi-instance proof.

**BILL-3:** not started. **Payments:** none. **Main / Vercel / live DBs:** unchanged.
