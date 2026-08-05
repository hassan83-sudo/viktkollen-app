# AI Route Auth Test Guide V1

## Lokala kontrakt

Kor:

```text
npm run validate:staging
npm run verify:coach-route
npm run verify:photo-route
npm test -- --run
```

Utan URL gor route-preflight ingen remote request och ingen providerrequest.

## Remote Preflight

Mot staging/preview:

```text
npm run verify:coach-route -- --url https://preview-url
npm run verify:photo-route -- --url https://preview-url
```

Standardpreflight skickar ingen token och ska verifiera:

- saknad auth ger `401`
- inget provideranrop kravs
- `Cache-Control` innehaller `no-store`
- felsvaret har sakert schema
- inga secrets lacker

## Authenticated Provider Test

Riktig providerverifiering ska bara goras manuellt med ett aktivt testkonto och tydligt godkannande. Token far inte skrivas ut, sparas i filer eller laggas i trace/screenshots.

## Forvantade Svar

Saknad auth:

```json
{
  "ok": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "safeMessage": "Logga in for att anvanda remote AI."
  }
}
```

Rate limit:

```json
{
  "ok": false,
  "error": {
    "code": "RATE_LIMITED",
    "retryable": true,
    "retryAfterSeconds": 60
  }
}
```

## Regressioner Som Ska Stoppa Release

- Provider anropas fore godkand auth.
- Client-provided `userId` anvands som identitet.
- Token syns i response, logg, docs, backup, export eller sync.
- AI-route saknar `no-store`.
- Service worker cachear `/api/`.
- Tva anvandare delar rate-limitbucket eller dedup-resultat.
