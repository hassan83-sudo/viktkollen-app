# BILL-4B2a — Provider registry, feature mapping & operational resolver

Branch: `billing-cost-metering-sprint1`
Base BILL-4B1b: `1ab6e22f18e602fe90ed4b59a59877c1d97b68a7`

No migration. No provider table, RPC, admin mutation, or audit. Not wired to live provider calls.

## Canonical providers

Inventoried from live `api/*` + BILL-1. Not guessed.

| provider_id | classification | Evidence |
| --- | --- | --- |
| `openai` | EXTERNAL_API | `api/_shared/openaiGateway.js`, `api/ai`, `api/adaptive-coach`, `api/nutrition-photo-analysis`, `api/forgotten-items-analysis`, `api/body-analysis` / `bodyAnalysisAi.js`, Realtime `createRealtimeVoiceSession`. BILL-1 usage `provider: 'openai'`. |
| `google.cloud_run.ai_ear` | EXTERNAL_COMPUTE | `api/ai-ear/interpret` → Cloud Run `perch-inference` `/v2/interpret`. |

Not registered as feature providers: Supabase (app platform), Vercel (hosting), browser `speechSynthesis` / Web Speech (device), `api/meal-analysis` (no live OpenAI call).

## Modes and results

Provider modes: `AVAILABLE` | `UNAVAILABLE` | `MAINTENANCE`.

Provider results: `PROVIDER_AVAILABLE` | `PROVIDER_UNAVAILABLE` | `PROVIDER_MAINTENANCE` | `UNKNOWN_PROVIDER`.

Operational results add feature outcomes: `AVAILABLE` | `DISABLED` | `MAINTENANCE` | `UNKNOWN_FEATURE` | `PROVIDER_UNAVAILABLE` | `PROVIDER_MAINTENANCE` | `UNKNOWN_PROVIDER`.

Reasons: `PROVIDER_OUTAGE`, `MAINTENANCE`, `SECURITY`, `MANUAL_ADMIN`. Version integer ≥ 1 on a control (CAS persistence is BILL-4B2b).

## Defaults

Known provider, no control: **AVAILABLE / PROVIDER_AVAILABLE** so missing persistence does not darken live integrations.

Unknown provider: **UNKNOWN_PROVIDER**, never AVAILABLE.

## Feature → provider mapping

Same BILL-4B1a feature IDs. Required providers is an array (empty = none). No feature currently needs more than one; the resolver still requires **all** listed providers.

| feature_id | required providers | Note |
| --- | --- | --- |
| `ai.ear.interpret` | `google.cloud_run.ai_ear` | EXTERNAL_COST live hop |
| `ai.eye.analysis` | `openai` | Vision forgotten-items |
| `ai.text.request` | `openai` | adaptive-coach + `api/ai` |
| `ai.voice.session` | `openai` | Realtime mint; PARTIAL metering |
| `body.scan` | `openai` | Vision body analysis |
| `food.scan` | `openai` | nutrition photo |
| `gps.live.session` | none | device + Supabase; not an AI provider |
| `tts.request` | none | browser `speechSynthesis` |
| `friend_chat` | none | LOCAL_FREE |
| `gps_standard` | none | LOCAL_FREE |
| `ready_avatar` | none | LOCAL_FREE |
| `smart_ai` | none | umbrella, not a live hop |

PARTIAL mapping (voice) is operational only: it does **not** mean complete cost/quota coverage.

## Operational resolver

`resolveOperationalAvailability({ featureId, featureControl, providerControls })`

Order:

1. unknown feature → `UNKNOWN_FEATURE`
2. feature DISABLED → `DISABLED` (provider AVAILABLE does not override)
3. feature MAINTENANCE → `MAINTENANCE`
4. required provider unknown → `UNKNOWN_PROVIDER`
5. required provider UNAVAILABLE → `PROVIDER_UNAVAILABLE`
6. required provider MAINTENANCE → `PROVIDER_MAINTENANCE`
7. else → `AVAILABLE`

Client `providerAvailable` / `featureEnabled` / `isAdmin` ignored.

## Emergency semantics

Provider `UNAVAILABLE` is the emergency stop for **new** operations that require that provider. BILL-4B2a does **not** abort a call already in flight. The resolver is not hooked to production routes yet.

## Secrets / configured

No api_key, token, password, or service-account JSON in the model. Optional `configured` is a boolean only; credentials are never returned. Runtime env is not read here.

## BILL-4B2b remaining

Persist provider controls, unique `provider_id`, version CAS, BILL-4A admin mutation + audit, optional wire to new operations. Still no cost (4C), quota consume, or subscription.
