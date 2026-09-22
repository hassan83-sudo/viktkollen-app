# BILL-4C2b2 — Final cost safety decision

Status: **PARTIAL — implementation + tests written, automated test run blocked by environment (see "Test execution" below)**
Base: `fc54c3a808bf96bccd4b26041f4ab7ab99f70684` (BILL-4C2b1: select cost thresholds and summaries)

No live enforcement, no migration, no staging/production mutation, no main merge, no new API route.

## What this adds

`resolveFinalCostSafety({ clientClaim, costDriving, featureId, selectedThresholds, summariesByKey })`
in `src/services/billing/finalCostSafety.js`.

A pure, server-side function that turns the BILL-4C2b1 threshold/summary
pairing into **one** deterministic final decision. It issues no aggregation
queries, mutates no state, calls no provider, and performs no quota,
subscription, threshold, or audit mutation. It reuses, unchanged:

- `resolveCostSafety` (BILL-4C1a) — evaluated once per selected threshold
- `selectApplicableCostThresholds`, `buildCostSummaryPlan`,
  `collectCostThresholdSummaries` (BILL-4C2b1) — called by the caller
  *before* `resolveFinalCostSafety`, never by this module itself

No parallel cost model was created.

## Final precedence

Highest to lowest:

1. `INVALID_COST_INPUT` on any pairing → final `INVALID_COST_INPUT` (deny). Defensive: only occurs if a pairing is malformed (currency/period/scope/feature mismatch) — should not occur when the pairing comes from BILL-4C2b1's own functions, since those already keep pairs aligned.
2. `COST_HARD_STOP` on any pairing → final `COST_HARD_STOP` (deny).
3. `COST_UNAVAILABLE` on a **HARD_STOP** threshold → final `COST_UNAVAILABLE`, `allow: false` ("hard unavailable", per BILL-4C1a — never `COST_SAFE`).
4. `COST_SOFT_ALERT` on any pairing → final `COST_SOFT_ALERT` (`allow: true`).
5. `COST_UNAVAILABLE` on a **SOFT_ALERT** threshold only → final `COST_UNAVAILABLE`, `allow: true` ("soft unavailable" — signalled, never pretended `0`).
6. Otherwise → final `COST_SAFE`.

Every selected threshold is evaluated — GLOBAL and FEATURE, DAILY and
MONTHLY alike — so a hard stop anywhere in the matrix always wins; no
scope or period can bypass an applicable hard stop elsewhere. A hard
unavailable result is never downgraded by an unrelated soft result,
because tier 3 is checked before tier 4/5.

### No active thresholds

If `selectedThresholds` is empty (nothing enabled/applicable — including
because the feature is `LOCAL_FREE` or `costDriving === false`, which
BILL-4C2b1's selection stage already reduces to zero selected thresholds),
`resolveFinalCostSafety` returns a **non-blocking** result with
`no_active_threshold: true` and `reason: 'NO_ACTIVE_THRESHOLD'`. This is
kept distinct from the "evaluated and safe" case, which returns
`no_active_threshold: false` and `reason: 'ALL_SAFE'`. No threshold is
fabricated to produce a decision either way.

### Local-free policy

A `LOCAL_FREE` feature is never blocked by unrelated cost thresholds: the
BILL-4C2b1 selection stage already returns zero selected thresholds for
such a feature (see `costThresholdSelection.js`), so it always lands on
the `NO_ACTIVE_THRESHOLD` / allow path here regardless of what global or
other-feature thresholds exist.

### Classification preservation

`MEASURED`, `ESTIMATED`, and `UNAVAILABLE` are passed straight through
from each per-threshold `resolveCostSafety` evaluation into the final
`evaluations`/`triggered` metadata. `ESTIMATED` is never claimed as
certain; `UNAVAILABLE` is never represented as `0` (its `amount_minor`
stays `null`).

### Safe output

The returned object carries only: `allow`, `estimated`, `evaluations`,
`feature_id`, `metering_complete`, `no_active_threshold`, `reason`,
`result`, `triggered`. Each evaluation/trigger entry carries only:
`amount_minor`, `classification`, `currency`, `estimated`, `feature_id`,
`mode`, `period`, `result`, `scope`, `threshold_id`, `threshold_minor`.
No prompt, response, audio, image, GPS, chat text, API key, token, or
credential ever enters this module, so none can leak out of it.

### Client spoof resistance

`clientClaim` fields (`costSafe`, `ignoreHardStop`, `currentCost`,
`threshold`, `classification`, `underLimit`) are read only to be
discarded (`void`), exactly like BILL-4C1a/4C2b1. The final decision is
computed solely from the server-supplied `selectedThresholds` /
`summariesByKey` pairing; there is no code path by which a client-claimed
value can change the outcome.

### Unknown feature

`featureId` is re-validated with the same canonical-resolution + fail-safe
throw (`unknown_feature`) pattern as `costSafety.js` /
`costThresholdSelection.js`, independent of whether the caller already
validated it upstream.

## Known limitations (unchanged from BILL-4C2a/4C2b1)

- **Historical cost: PARTIAL** — BILL-1 does not store authoritative money
  per usage event; catalog-priced rows remain `ESTIMATED`. Not solved in
  this sprint.
- **50K foundation: PARTIAL** — aggregation queries are bounded by
  `event_type` + `occurred_at`, but pricing/aggregation still happens in
  application code after rows are read. Not solved in this sprint;
  architecture unchanged.

## Test execution

**BILL-4C2b2 tests were written but could not be executed from this
session.** The billing worktree's `node_modules` was installed natively
on the Windows machine (only the `@rolldown/binding-win32-x64-msvc`
native binding is present). This session's shell runs inside a sandboxed
Linux VM with that folder mounted, which needs the Linux binding instead;
fetching it requires npm registry access, which this session's network
policy blocks (`403` from the proxy, same restriction that blocked
`git fetch`). Computer-use was considered as a fallback, but this
session's terminal/IDE access tier only allows clicking, not typing
commands, so it cannot run `npm test` either.

**Nothing above is a code change** — it's an inability to execute tests
*from this remote session*, not a test or build failure. `vitest` should
run normally in your own Windows terminal, where the correct native
binding is already installed. Recommended commands, run locally in
`C:\Users\hassa\viktkollen-app-bill1`:

```
npx vitest run src/services/billing/finalCostSafety.test.js
npx vitest run src/services/billing/costThresholdSelection.test.js
npx vitest run src/services/billing/costAggregation.test.js
npx vitest run src/services/billing/costThreshold.persistence.test.js
npx vitest run src/services/billing/costSafety.test.js
npx vitest run src/services/billing
npm run lint
npm run build
```

### Test matrix written (`finalCostSafety.test.js`, 24 tests)

no active threshold (+ distinguished from measured-safe) · one soft safe ·
one soft reached · one hard safe · one hard reached · soft reached + hard
safe · hard reached + soft reached · global hard + feature safe · feature
hard + global safe · daily hard + monthly safe · monthly hard + daily
safe · multiple soft (dedup to one final) · hard unavailable (deny, never
safe) · hard unavailable never downgraded by unrelated soft · soft
unavailable (allow, not treated as 0) · estimated preserved · measured
preserved · known-zero (MEASURED 0) stays safe · LOCAL_FREE never blocked
by unrelated thresholds · unknown feature fails safe (with and without
active thresholds) · client spoof ignored · safe output field allowlist ·
no duplicate aggregation (integration test against BILL-4C2b1's own
dedup, asserting call count is unchanged after `resolveFinalCostSafety`
runs).

## Remaining risks

- Test suite is unexecuted from this session; correctness rests on manual
  review + code reuse of already-verified BILL-4C1a/4C2b1 logic until you
  run it locally.
- `INVALID_COST_INPUT` precedence (tier 1) is defensive and has no
  reachable path through the normal BILL-4C2b1 pairing pipeline today —
  worth a second look in security review to confirm it can never mask a
  real hard-stop if the pairing logic changes later.
- No live wiring exists yet to any route; this sprint is decision logic
  only.

## Next security-review requirements

- Run the full billing regression suite locally and attach results.
- Confirm `npm run build` and Vercel deployable-function count (expect
  unchanged at 11; no API route was added).
- Combined BILL-4C security review (BILL-4C1a + 4C1b + 4C2a + 4C2b1 +
  4C2b2) before any live enforcement work begins.
