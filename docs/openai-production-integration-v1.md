# OpenAI Production Integration V1

Viktkollen anvander regelbaserade motorer som stabil grund. OpenAI används endast som server-side formulering och bildanalys när användaren aktivt väljer det.

## Arkitektur

- `api/_shared/openaiGateway.js`: gemensam server-side gateway for OpenAI Responses API.
- `api/adaptive-coach/index.js`: strikt coachroute for sammanfattade facts.
- `api/nutrition-photo-analysis/index.js`: photo route ateranvander gatewayen.
- `src/services/ai/coachRequestBuilder.js`: bygger minimerad coachpayload.
- `src/services/ai/aiResponseSafety.js`: blockerar osakra AI-resultat.
- `src/services/ai/remoteCoachService.js`: klientens single-flight/dedupe och safe fallback.
- `AdaptiveCoachPanel`: visar regelbaserad coach direkt och remote AI endast efter aktiv opt-in och knapptryck.

## Servergateway

Gatewayen hanterar:

- server-side `OPENAI_API_KEY`
- servervald modell
- timeout
- request-id
- strukturerad JSON-tolkning
- safe error codes
- in-memory rate limiting
- output limit
- ingen prompt eller providerresponse i loggar

Clienten far inte välja modell eller systemprompt.

## Coach Route

`/api/adaptive-coach`:

- POST-only
- JSON-only
- kräver `consent: true`
- blockerar auth/session/e-post/token/deviceId/raw history/base64/diagnostics/exportdata
- tar endast sammanfattade metrics, highlights, attention items, goals och coverage/confidence
- returnerar strikt normaliserat coachresultat

Utan providerkonfiguration eller vid fel används regelbaserad fallback i klienten.

## Photo Route

Photo route behåller:

- MIME-kontroll
- filsignatur
- storleksgräns
- rate limit
- timeout
- providerpayload-validering
- review före save

Bilden skickas bara när användaren aktivt analyserar. Rå bild, prompt och providerresponse sparas inte i måltid, export, backup eller sync.

## Kända Begränsningar

- In-memory rate limit är grundskydd i serverless och kan nollställas mellan instanser.
- Server-side Supabase-tokenverifiering är inte införd i denna sprint. Route skyddas av payloadgränser, consentkrav och rate limit, men riktig abuse protection bör valideras i staging.
- Remote provider-test körs inte automatiskt.

## OpenAI Docs

Implementation använder OpenAI Responses API med server-side fetch och strukturerade JSON-svar. Officiell modelldokumentation anger att Responses API och structured outputs stöds för moderna modeller, men Viktkollen låter servermiljön välja modell via env och exponerar inga modellval i klienten.
