# Nutrition Scanner V3

## Nuläge från V2

Nutrition Scanner V2 är fortsatt grunden: komponenten lazy-loadas från `MealLogger`, bilden förhandsvisas lokalt, analysen blir ett review draft, och sparning sker först efter användarens bekräftelse till befintlig mealmodell. V3 skapar ingen ny måltidsmodell och ingen ny lagringsnyckel.

## Serverroute

Remote bildanalys går via `api/nutrition-photo-analysis/index.js`.

Routen:

- accepterar endast `POST`
- kräver `multipart/form-data`
- accepterar endast JPEG, PNG och WebP
- begränsar request- och bildstorlek
- kontrollerar enkel filsignatur mot MIME
- använder server-side `OPENAI_API_KEY`
- kör timeout med `NUTRITION_PHOTO_TIMEOUT_MS`
- kör in-memory rate limit med `NUTRITION_PHOTO_RATE_LIMIT_WINDOW_MS` och `NUTRITION_PHOTO_RATE_LIMIT_MAX`
- returnerar svensk säker felmodell med stabil felkod
- loggar endast metadata som status och item count

Routen sparar aldrig bilden permanent och returnerar aldrig rå providerrespons.

## Miljövariabler

Server:

- `OPENAI_API_KEY`
- `NUTRITION_PHOTO_MODEL`
- `NUTRITION_PHOTO_MAX_FILE_BYTES`
- `NUTRITION_PHOTO_TIMEOUT_MS`
- `NUTRITION_PHOTO_RATE_LIMIT_WINDOW_MS`
- `NUTRITION_PHOTO_RATE_LIMIT_MAX`

Client-säkra readiness-flaggor:

- `VITE_NUTRITION_PHOTO_REMOTE_ENABLED`
- `VITE_NUTRITION_PHOTO_MAX_FILE_MB`
- `VITE_NUTRITION_PHOTO_TIMEOUT_MS`
- `VITE_NUTRITION_PHOTO_RATE_LIMIT_MAX`

Inga serverhemligheter exponeras i klientbundle eller Launch Readiness.

## AI-kontrakt

Servern tillåter endast:

- `detectedItems`
- `estimatedServing`
- `estimatedNutrition`
- `confidence`
- `limitations`
- `warnings`
- `safeSummary`
- `providerType`
- `modelVersion`

Varje detected item begränsas till namn, mängd, enhet, kalorier, protein, kolhydrater, fett, confidence och alternativ. Text saneras, arraylängder kapas och negativa eller extrema nutritionvärden stoppas eller nollas till säkra fallbackvärden.

## Promptprinciper

Serverprompten instruerar modellen att analysera synliga livsmedel, uppskatta portioner försiktigt, redovisa osäkerhet och returnera endast JSON. Den ber inte om kedja-av-tankar och skickar inte profil, historik, auth, coachhistorik eller diagnostics.

Prompten förbjuder medicinska råd, diagnos, kroppskommentarer och moralisk bedömning av mat.

## Request och Response

Clienten skickar endast:

- temporär preprocessed image blob
- `mealType`
- schema-id
- anonym transient client-id för rate limit

Response normaliseras med `normalizeNutritionPhotoAnalysis` innan review. Vid 429, timeout, saknad konfiguration eller invalid provider response visas ett säkert fel. Remote-fel ersätts inte automatiskt med mock.

## Rate limiting och kostnadskontroll

Servern har in-memory rate limit per transient client eller IP-header. Den passar serverless som ett grundskydd men är inte ett globalt kvotsystem över alla instanser. Ingen automatisk server- eller client-retry körs för kostnadsbärande analys.

## Samtycke och integritet

Remote-knappen är spärrad tills användaren aktivt markerar samtycke. Rutan är inte förkryssad. UI:t informerar att bilden skickas till tillfällig AI-analys, att originalbilden inte sparas av Viktkollen och att resultatet måste granskas före sparning.

Bilddata rensas vid avbryt, ny bild, unmount och efter lyckad save.

## Barcode och Matdatabas

V3 lägger till `nutritionPhotoIngredientMatching.js`, en deterministisk adapter mot befintlig nutritiondatabas. Den kan ge:

- `exactMatch`
- `normalizedMatch`
- `multipleMatches`
- `noMatch`

Ingen fuzzy AI-merge görs och ingen databaspost skriver över manuellt redigerade värden utan användarval.

## Reviewflöde

Review visar datakälla per ingrediens:

- AI-uppskattning
- Streckkod
- Matdatabas
- Manuellt värde

Användaren kan markera en ingrediens som osäker, använda en säker databasmatchning, lägga till saknad olja, sås eller dryck och se skillnad mellan ingredienssumma och sparvärde.

## Metadata

Sparad `photoAnalysis` innehåller endast minimal metadata:

- `source`
- `analysisId`
- `providerType`
- `confidence`
- `userEdited`
- `analyzedAt`
- `dataSources`
- `itemCount`
- `reviewCompleted`

Ingen bild, base64, blob URL, filnamn, prompt, rå respons eller provider request-id sparas.

## Dashboard, Rapporter och Adaptive Coach

Usage summary visar fortsatt antal fotoanalyser, redigerade analyser och låg confidence. V3 utökar facts med providerfördelning och datakällor när metadata finns. Dashboard, veckorapport, månadsrapport och Adaptive Coach ska bara använda sparade, granskade måltider.

## Offline och PWA

Scanner, filval och preview fungerar offline. Remote analys blockeras offline med tydlig status. Det finns ingen bakgrundskö, ingen automatisk upload när nätet återkommer och ingen service worker-cache av bildrequest eller analysresponse.

## Launch Readiness

Development-only readiness visar om remote photo analysis är aktiverad, route-namn, mock mode, timeout, maxstorlek och rate limit. Den visar aldrig nycklar.

## Säkerhetsreview

V3 kontrollerar requeststorlek, MIME, filsignatur, textsanering, CORS i Vercel-miljö, timeout, rate limit och säker felmodell. Filnamn används inte i prompten. Det finns ingen eval, ingen HTML-rendering och inga externa bild-URL:er.

## Performance

Scanner-komponenten är fortsatt lazy-loaded. Provider importeras först efter användarens analysklick. Serverrouten påverkar inte klientbundlen. Ingredient matching ligger i scannerchunken, inte i appens initiala shell.

## Tester

Tester täcker serverroute, provider, AI-schema-validering, ingredient matching, metadata och UI-kontrakt. E2E ska köras utan riktig kostnadsbärande AI.

## Manuella testfall

- Remote route utan `OPENAI_API_KEY` ger säkert 503.
- Remote route med giltig testprovider ger strukturerad analys.
- Invalid MIME och spoofad filsignatur blockeras.
- Remote-knapp kräver aktivt samtycke.
- Offline blockerar remote men tillåter manuell/lokal väg.
- Review sparar ingen bilddata.
- Dashboard och rapporter visar endast metadata.
- PWA offline shell fungerar utan analyskö.

## Kända begränsningar

Rate limit är processlokal i serverless och bör ersättas av central kvotlagring i V4 om hög trafik väntas. V3 gör ingen extern streckkodsuppslagning från photo review och ingen automatisk fuzzy merge.
