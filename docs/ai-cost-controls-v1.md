# AI Cost Controls V1

## Kostnadsskydd

- Ingen remote AI vid appstart.
- Ingen remote AI vid render, navigation, viktregistrering eller måltidsloggning.
- Aktiv knapp krävs.
- Opt-in krävs.
- Max tre coachrekommendationer.
- Max output begränsas server-side.
- Servern väljer modell.
- Ingen automatisk kostnadsbärande retry.
- Single-flight och dedupe i klienten.
- Timeout i klient och server.
- Rate limit per anonym scope.

## Routes

Coach:

- `OPENAI_COACH_MODEL`
- `OPENAI_COACH_TIMEOUT_MS`
- `OPENAI_COACH_RATE_LIMIT_MAX`
- `OPENAI_MAX_OUTPUT_TOKENS`

Photo:

- `NUTRITION_PHOTO_MODEL`
- `NUTRITION_PHOTO_TIMEOUT_MS`
- `NUTRITION_PHOTO_RATE_LIMIT_MAX`
- `NUTRITION_PHOTO_MAX_FILE_BYTES`

## Preflight

```bash
npm run validate:staging
npm run verify:coach-route
npm run verify:photo-route
```

Preflight kör ingen riktig kostnadsbärande AI som standard.

## Begränsning

In-memory rate limiting är inte ett komplett produktions-abuse-skydd för distribuerad serverless. Det är ett grundskydd och ska kompletteras med deployment-/providerbaserade limits vid go-live.
## AI Route Security V2

Rate limiting sker efter verifierad Supabase-session och ar user-scoped for coach respektive photo analysis. Nuvarande adapter ar `process-local`, vilket ar ett grundskydd per serverprocess men inte en global kvot over alla serverless-instanser.

Preflight gor som standard inga kostnadsbarande provideranrop. Riktig providerverifiering kraver staging-URL, giltig anvandarsession och explicit manuell acceptans.
