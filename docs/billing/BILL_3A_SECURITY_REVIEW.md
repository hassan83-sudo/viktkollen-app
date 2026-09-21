# BILL-3A — Subscription migration security review

Branch: `billing-cost-metering-sprint1`
Base BILL-3: `6ce753decbc97d2420488575d6cf9d340769cec9`
`origin/main`: `c8899a5` (unchanged).

Migration reviewed and locally hardened in place:
`supabase/migrations/20260921200000_billing_subscriptions.sql`

**This SQL was not applied. Staging and production were not contacted.** BILL-1/BILL-2 production foundations are untouched. BILL-4 was not started.

## Verdict

| Gate | Result |
|---|---|
| Client PostgREST (anon / authenticated) | **PASS** (FORCE RLS deny-all + no table grants) |
| Direct table INSERT/UPDATE/DELETE by `service_role` | **BLOCKED after harden** (SELECT + RPC only) |
| DB state machine + terminal lock | **PASS locally — unapplied** |
| One open subscription per user | **PASS locally — unique partial index** |
| Concurrent create across Vercel isolates | **DB unique index is SoT**; in-memory isolated stores can still both succeed |
| Apply to staging/production now | **DO NOT APPLY** |

## Local SQL harden (same file, unapplied)

| Former gap | Local change |
|---|---|
| `service_role` could raw INSERT/UPDATE period, plan, grace, cancel flag | Table INSERT/UPDATE/DELETE revoked; `create_subscription` / `transition_subscription` / `schedule_cancel_at_period_end` SECURITY DEFINER |
| Period could be extended on UPDATE | Trigger: `current_period_start` immutable; `current_period_end` cannot increase |
| Provider refs mutable | Immutable once non-empty; token charset CHECK (no JSON/secret blobs) |
| Unique `external_event_id` on the row only | `billing.subscription_events` PK; first-write-wins on the subscription copy |
| `past_due_grace_until` could be pushed forward | Cannot extend; CHECK grace only when `PAST_DUE` |
| No RPC `FOR UPDATE` | Transition/cancel helpers lock the row |
| Weak 50K lookup | Extra `(user_id, status)` index + unique provider sub-ref when both non-empty |

In-memory `subscriptionStore.replace` now matches those immutability rules. Isolated Maps are still not a multi-instance lock.

## Table inventory

Two BILL-3 tables: **`billing.subscriptions`** and **`billing.subscription_events`**.

### `billing.subscriptions`

| | |
|---|---|
| **Purpose** | Authoritative subscription state → plan snapshot → later quota assignment. Not payment-credential storage. |
| **PK** | `subscription_id` text (default `gen_random_uuid()::text`) |
| **FK** | `plan_id` → `billing.plans(plan_id)` **ON DELETE RESTRICT ON UPDATE RESTRICT**; `pending_plan_id` same. No FK to `auth.users` (avoids cascade wipe of billing history; `user_id` is uuid NOT NULL). |
| **Unique** | PK; one open row per `user_id` WHERE status ∈ open; `(provider, provider_subscription_ref)` WHERE both non-empty. Row `external_event_id` is first-write-wins (trigger keeps the original). |
| **CHECK** | status allowlist; `period_end > period_start`; `plan_version >= 1`; pending pair/when; provider/event token charset + length; grace only if `PAST_DUE` |
| **Indexes** | PK; unique indexes above; `(user_id, current_period_end desc)`; `(user_id, status)` |
| **RLS** | ENABLE + FORCE; restrictive `FOR ALL TO public USING (false) WITH CHECK (false)` |
| **Grants** | `anon`/`authenticated`/`public`: none. `service_role`: **SELECT** only. INSERT/UPDATE/DELETE revoked including `service_role`. EXECUTE on the three helpers: `service_role` only. |

### `billing.subscription_events`

| | |
|---|---|
| **Purpose** | Idempotent external event identity (future processor events). No payload. |
| **PK** | `external_event_id` text |
| **FK** | `subscription_id` → `billing.subscriptions` **ON DELETE RESTRICT ON UPDATE RESTRICT** |
| **Unique** | PK (global event uniqueness) |
| **CHECK** | token charset + length |
| **Indexes** | PK; `(subscription_id, created_at desc)` |
| **RLS** | ENABLE + FORCE; deny-all to public |
| **Grants** | `service_role` SELECT only; writes only via SECURITY DEFINER helpers |

No `json`/`jsonb`/metadata column. No card, CVV, bank, prompt, audio, image, GPS, password, or API-key columns.

## State machine (DB + JS, identical)

Allowed (same status is a no-op):

- `TRIALING` → `ACTIVE` \| `CANCELED` \| `EXPIRED` \| `PAUSED`
- `ACTIVE` → `PAST_DUE` \| `PAUSED` \| `CANCELED` \| `EXPIRED`
- `PAST_DUE` → `ACTIVE` \| `CANCELED` \| `EXPIRED` (**not** `PAUSED`)
- `PAUSED` → `ACTIVE` \| `CANCELED` (**not** `EXPIRED`)
- `CANCELED` / `EXPIRED` → none (terminal)

Examples from the review list that are **intentionally blocked** (BILL-3 policy, not omitted by accident): `PAST_DUE → PAUSED`, `PAUSED → EXPIRED`, all terminal reactivations (`CANCELED → ACTIVE/TRIALING/PAST_DUE`, `EXPIRED → ACTIVE/TRIALING/PAUSED`).

Open statuses (unique index / insert allowlist): `TRIALING`, `ACTIVE`, `PAST_DUE`, `PAUSED`. Two of these cannot coexist for one user at the DB layer, so they cannot both be effective.

## Periods, cancel-at-period-end, PAST_DUE, trial

- Periods are `timestamptz NOT NULL`; CHECK `end > start`. Resolver entitled window is `[start, end)` using **server** `now`, not client clock. `ACTIVE` after `period_end` is **not** entitled.
- `created_at` / `updated_at` overwritten with `pg_catalog.now()` in the guard trigger.
- `cancel_at_period_end` keeps entitlement while status is entitled and `now < period_end`. Clients have no UPDATE path to clear the flag. Trusted `transition_subscription` may still pass an explicit boolean (resume-before-end is a later processor concern).
- `PAST_DUE` is not entitled unless `past_due_grace_until` is set and `now < grace` **and** still in period. No implicit infinite grace.
- Trial is `TRIALING` + period + plan. No seed. Client cannot INSERT a trial (no grants; no POST route).

## Idempotency / provider

- Unique `billing.subscription_events.external_event_id`; create/transition RPCs return the existing subscription on replay and do not extend the period or change plan.
- Provider columns are optional empty tokens, not secrets. Client-safe GET omits them. Unique provider subscription ref when both sides are non-empty.

## Effective plan / quota

Resolver: no row → `plan.free`; unknown plan_id → `plan.free`; `PAUSED`/`CANCELED`/`EXPIRED`/ended period/`PAST_DUE` without grace → `plan.free`; `ACTIVE`/`TRIALING` in period → snapshot `plan_id` + `plan_version`; historical inactive plan still resolves if the catalog still has that id.

Quota: `createSubscriptionAssignmentStore` ignores `clientClaim.plan_id`. Production GET `/api/billing/quota` is still the BILL-2 default assignment (`plan.free`) so live users are not gated. Transitions do not DELETE `billing.usage_events` or `billing.quota_reservations` (this migration does not ALTER those tables).

## SECURITY DEFINER

`create_subscription`, `transition_subscription`, `schedule_cancel_at_period_end`: `SECURITY DEFINER`, `SET search_path = pg_catalog, pg_temp`, schema-qualified `billing.*`, status/period/user validation, `FOR UPDATE` on transition/cancel. `p_user_id` is a trusted-server argument (JWT in a future API), not `auth.uid()` from PostgREST. EXECUTE not granted to `public`/`anon`/`authenticated`.

## 50K foundation

Partial unique open-per-user + `external_event_id` uniqueness + `(user_id, status)` / period indexes are enough for lookup at 50K users. Live multi-instance create races wait on the unique index (and RPC `FOR UPDATE` for updates). Remaining: Node in-memory store is still process-local until BILL-3B wires the RPCs.

## Remaining risks

- SQL unapplied; JS tests do not execute PostgreSQL.
- `service_role` key still bypasses RLS; it no longer has table write grants, but a stolen key can EXECUTE the helpers. Keep it server-only.
- Period **renewal** (extending `current_period_end`) is intentionally blocked until a later trusted RPC.
- `pending_plan_*` is unused (no proration / apply-now).
- Production quota API not switched to the subscription assignment store.

## Staging recommendation

**DO NOT APPROVE YET.** Next: Hassan review, then BILL-3B isolated staging apply + live unique-index race — same preflight pattern as BILL-1E/2B. Never use production env. Do not start BILL-4 from this review.
