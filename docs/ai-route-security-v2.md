# AI Route Security V2

## Nulage

Viktkollen har tva kostnadsbarande AI-routes:

- `/api/adaptive-coach`
- `/api/nutrition-photo-analysis`

OpenAI-nyckeln ligger server-side och klienten gor inga provideranrop direkt. Den har sprinten laser routes bakom verifierad Supabase-session, user-scoped rate limiting, kortlivad request-deduplication och `no-store`.

## Autharkitektur

Klienten hamtar aktuell session via befintlig Supabase Auth i `getCurrentAuthSession()`. Access token lases precis fore anvandarinitierat remote AI-anrop och skickas endast som:

```text
Authorization: Bearer <access token>
```

Token skickas inte i body, URL, fingerprint, localStorage, backup, sync, export eller diagnostics.

Servern verifierar token i `api/_shared/verifySupabaseUser.js` med Supabase Auth `getUser(token)` via server-side Supabase-klient och anon key. Service-role anvands inte for normal tokenverifiering. Servern accepterar aldrig `userId` fran klientpayload som identitet.

## Routeordning

`/api/adaptive-coach`:

1. Metod
2. Content-Type
3. Payloadstorlek
4. Supabase-auth
5. Consent
6. Payload- och safetykontroll
7. User-scoped rate limit
8. User-scoped dedup
9. OpenAI
10. Strikt schema
11. Saker respons

`/api/nutrition-photo-analysis`:

1. Metod
2. Ursprungskontroll
3. Supabase-auth
4. Content-Type
5. User-scoped rate limit
6. Multipartstorlek
7. Bildsignatur och MIME
8. User-scoped dedup
9. OpenAI
10. Validerad nutritionrespons
11. Saker respons

## Felmodell

AI-routes returnerar sakra fel med:

- `code`
- `safeMessage`
- `requestId`
- `retryable`
- `retryAfterSeconds` nar relevant

Response far inte innehalla token, user ID, e-post, provider-body, stack trace, systemprompt, ra prompt, ra anvandardata eller bildmetadata.

## Rate Limiting

`api/_shared/aiRateLimiter.js` anvander verifierad Supabase user ID som scope och hashar scope innan bucket-nyckeln skapas.

Separata buckets anvands for:

- `adaptiveCoach`
- `nutritionPhoto`

Nuvarande adapter ar `process-local`. Det ar ett grundskydd per serverprocess/serverless-instans och inte en global kvotgaranti. En framtida global adapter kan inforas utan att andra routekontraktet.

## Deduplication

`api/_shared/aiRequestDeduper.js` deduplicerar kortlivat per:

- route
- verifierad anvandare
- saker requestfingerprint

Tva olika anvandare delar aldrig in-flight-resultat. Ingen persistent AI-cache anvands.

## Cachepolicy

Alla AI-route-responser satter:

```text
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate
Pragma: no-cache
Expires: 0
```

Service workern exkluderar `/api/` och cachear inte AI-routes.

## Consentisolering

Coach och photo consent ar separata klientbeslut ovanpa auth. Servern kraver fortfarande explicit consentindikator dar routekontraktet kraver det. Consent ersatter aldrig server-side auth.

## Kanda Begransningar

- Rate limiting ar process-local, inte global.
- Authverifiering kraver Supabase URL och anon key i servermiljon.
- Riktig staging-providerverifiering kraver aktiv staging-URL, giltig anvandarsession och uttrycklig manuell acceptans.
