# BILL-1 — Cost & usage metering foundation

Branch: `billing-cost-metering-sprint1` from `origin/main` (`c8899a5`).

Fail-open: a metering error never changes the AI/user response.

## 1. Cost drivers actually found

| Driver | Where | Provider | Model (default/env) | Unit | Usage from provider | Cost |
|---|---|---|---|---|---|---|
| Adaptive AI coach | `api/adaptive-coach` → `callOpenAiJson` | OpenAI Responses | `OPENAI_COACH_MODEL` / `gpt-4.1-mini` | requests; tokens if `usage` present | Tokens MEASURED when `usage` exists, else UNAVAILABLE | ESTIMATED only with configured catalog; default UNAVAILABLE |
| Nutrition photo / food scan | `api/nutrition-photo-analysis` | OpenAI Vision | `NUTRITION_PHOTO_MODEL` / `gpt-4.1-mini` | requests (+ image_count=1) | same | same |
| AI Ögat forgotten-items | `api/forgotten-items-analysis` | OpenAI Vision | same photo model | requests | same | same |
| Legacy AI coach/insights | `api/ai` own `fetch` | OpenAI | `OPENAI_MODEL` / `gpt-5.6-luna` | requests | not instrumented | UNAVAILABLE |
| Body scan Vision | `src/services/bodyAnalysisAi.js` from `api/body-analysis` | OpenAI | `gpt-4.1-mini` | images/requests | not instrumented | UNAVAILABLE |
| Realtime voice session mint | `createRealtimeVoiceSession` | OpenAI Realtime | `VOICE_AI_MODEL` / `gpt-4o-mini-realtime-preview` | sessions | duration not returned | UNAVAILABLE |
| AI Örat | `api/ai-ear/interpret` → Cloud Run `perch-inference` | Google Cloud Run | n/a | audio request | no invoice mapping | UNAVAILABLE |
| Browser TTS / speech recognition | `speechSynthesis`, Web Speech | device/OS | n/a | not a Viktkollen API | no | N/A |
| GPS Live / Plats | geolocation + Supabase location writes | device + Supabase | n/a | writes/duration | no coords in BILL-1 | UNAVAILABLE |
| Legacy meal-analysis | `api/meal-analysis` | none (fail-closed) | n/a | n/a | never calls OpenAI | N/A |
| Supabase | auth, sync, social, location | Supabase | n/a | reads/writes/realtime | no invoice API | UNAVAILABLE |
| Vercel functions | `api/*` | Vercel | n/a | invocations | no billing API | UNAVAILABLE |

`src/services/premiumAnalytics.js` has simulated SEK numbers. Those are **not** copied into the production catalog.

## 2–3. Measured vs estimated vs unavailable

- **MEASURED**: provider token fields on an event (`metadata.usage_basis`).
- **ESTIMATED**: `quantity × catalog` when the catalog row is `CONFIGURED`.
- **UNAVAILABLE**: missing provider usage and/or unconfigured catalog (default).

## 4. Usage event schema

`event_id`, `reference_id`, `user_id`, `event_type`, `feature`, `provider`, `model`, `unit`, `quantity` (≥0 integer), `occurred_at`, `cost_basis`, `metadata` (allowlist only).

Event names: `ai.text.request`, `ai.voice.session`, `food.scan`, `ai.eye.analysis`, `ai.ear.interpret`, `body.scan`, `gps.live.session`, `tts.request`.

## 5. Privacy allowlist

Allowed metadata: `input_tokens`, `output_tokens`, `cached_tokens`, `total_tokens`, `image_count`, `usage_basis`.

Rejected: prompt, response, audio, image, image_url, coordinates, password, card_number, cvv, api_key, transcript.

## 6. Idempotency

Primary key `event_id` (OpenAI `requestId`). Duplicate insert is a no-op.

## 7–9. Catalog, money, FX

Default catalog rows are `UNCONFIGURED` (no invented prices). Historical `effective_from` / `effective_to` in tests.

Money: integer minor units (öre / cents). `round half away from zero`. FX is an explicit `{ sekOrePerMajor: { USD, EUR }, effective_at }` fixture — no live FX API.

## 10. Instrumented

- `callOpenAiJson` (adaptive coach, nutrition photo, forgotten-items)
- `createRealtimeVoiceSession`

## 11. Deferred

`api/ai`, body-analysis Vision, AI Örat Cloud Run, GPS duration, Vercel/Supabase invoices, TTS.

## 12. DB

Migration file only: `supabase/migrations/20260921121500_billing_usage_events.sql`. **Not applied.** Runtime store is in-memory until a later approved migration.

## 41. Failure policy

Fail-open. BILL-1 is not quota enforcement.
