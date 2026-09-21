# BILL-4B1a — Feature registry, kill switch model & availability resolver

Branch: `billing-cost-metering-sprint1`
Base BILL-4A: `76a0973a251455be0d080ec2626ce25570b2b794`

No database migration. No staging/production SQL. No admin persistence, provider map, quota calls, subscription resolver, or cost limits.

## Canonical feature IDs

Reused from `src/services/billing/features.js` (BILL-1 event types where metered; BILL-2 unmetered locals). No parallel ID system.

| feature_id | classification | coverage note |
| --- | --- | --- |
| `ai.ear.interpret` | EXTERNAL_COST | live API + BILL-1 meter |
| `ai.eye.analysis` | EXTERNAL_COST | live API + BILL-1 meter |
| `ai.text.request` | EXTERNAL_COST | live API + BILL-1 meter |
| `body.scan` | EXTERNAL_COST | live API + BILL-1 meter |
| `food.scan` | EXTERNAL_COST | live API + BILL-1 meter |
| `ai.voice.session` | PARTIAL | catalog-only; not a complete live meter |
| `gps.live.session` | PARTIAL | catalog-only |
| `tts.request` | PARTIAL | catalog-only |
| `smart_ai` | PARTIAL | umbrella, not a meter |
| `friend_chat` | LOCAL_FREE | unmetered local |
| `gps_standard` | LOCAL_FREE | unmetered local |
| `ready_avatar` | LOCAL_FREE | unmetered local |

Aliases (`food_scan`, `ai_text`, …) still resolve to the same canonical id.

## Classifications

- **EXTERNAL_COST** — live billed/metered path exists in this repo. Operational AVAILABLE does **not** mean quota remaining or cost-safe.
- **LOCAL_FREE** — local unmetered tools. Can still be DISABLED / MAINTENANCE. No quota/cost logic here.
- **PARTIAL** — catalog or umbrella only. Operational control is allowed; metering/quota/cost are **not** claimed complete.

## Modes

`ENABLED` | `DISABLED` | `MAINTENANCE`. Anything else is `invalid_feature_mode`.

## Result codes

`AVAILABLE` | `DISABLED` | `MAINTENANCE` | `UNKNOWN_FEATURE`

`AVAILABLE` means operationally allowed by this resolver only.

## Known feature, no control

**Compatibility default: ENABLED → AVAILABLE.** Existing Viktkollen tools must not go dark because BILL-4B1b has no row yet.

## Unknown feature

**Fail safe: `UNKNOWN_FEATURE`.** Never AVAILABLE.

## Resolver

`resolveFeatureAvailability({ featureId, control, clientClaim })` uses only the canonical registry and a validated control. It ignores `featureEnabled`, `isAdmin`, `modeOverride`. It does not call quota, effective plan, or providers.

Control fields: `feature_id` (canonical), `mode`, `reason_code`, `version` (integer ≥ 1). Reasons now: `MAINTENANCE`, `SECURITY`, `MANUAL_ADMIN`. `COST_CONTROL` is not accepted here.

Persistence and concurrent version updates are **BILL-4B1b**.

## Client spoof

Authoritative `DISABLED` wins over client ENABLED flags.

## Remaining work (BILL-4B1b)

Persist feature controls, unique `(feature_id)`, versioned updates, admin mutation + audit, wire `requireBillingAdmin`. Still no providers (4B2) or cost (4C).
