# AI Service Architecture V1

## Syfte

AI Service Architecture V1 minskar kopplingen mellan `App.jsx` och tunga AI-tjänster. Appskalet ska kunna rendera grundflödet utan att statiskt dra in coach, rapporter, förslag, konversationsminne eller bildanalys.

## Före

`App.jsx` importerade flera AI-moduler statiskt, bland annat coach context, deterministiska svar, AI Coach V2-rapport, veckorapport, proaktiva coachinsikter, AI-förslag, konversationsminne, API-service och måltidsbildanalys. Det gjorde att AI-kod lätt hamnade i den initiala importgrafen även när användaren inte öppnade AI-funktioner.

## Efter

Ny struktur:

- `src/services/ai/aiRuntimeLoader.js` äger dynamiska imports och cachear modul-löften.
- `src/services/ai/aiChatController.js` äger ren chatorkestrering: pending history, recent context, deterministisk reply och lokal fallback.
- `App.jsx` behåller UI-state, navigation och befintliga callbacks men importerar inte tunga AI-serviceimplementationer statiskt.

## Request Lifecycle

1. Användarens text trimmas och skickas från befintligt UI.
2. Parallella dubbelanrop från chatten blockeras med en in-flight ref.
3. `prepareCoachChatSubmission` försöker lazy-loada kontext/minne. Om importen misslyckas fortsätter synlig chatthistorik utan krasch.
4. `requestCoachChatReply` bygger de senaste 10 meddelandena och försöker deterministiskt svar.
5. Vid import- eller servicefel används samma lokala fallback som tidigare.
6. Laddningsstatus återställs i `finally`.

## Dynamiska Imports

Alla imports i runtime-loadern använder statiska strängar så Vite kan analysera chunks. Modullöften cacheas med `||=` så samma AI-service inte laddas flera gånger i onödan.

AI-moduler som laddas sent:

- AI API-service
- coach app context
- AI conversation memory
- deterministic coach replies
- AI suggestions/user context
- AI Coach V2 report service
- proactive coach service
- weekly report service
- meal photo analysis
- legacy personal coach reply

## Rapporter

Veckorapport, AI Coach V2-preview och proaktiva coachinsikter laddas när respektive vy eller effekt behöver dem. Rapporternas innehåll, datumdata och publika kontrakt är oförändrade.

## Fel Och Retry

Importfel ska inte visa tekniska stack traces. Där UI redan hade lokal fallback används den fortsatt. Chatten behåller användarens meddelande även om AI-svaret faller tillbaka.

## Bundle

Baseline före sprinten:

- `src/App.jsx`: 2472 rader
- initial huvudchunk: `index-DCFhPaPo.js`, 109.01 kB
- största AI-chunk: `ai-services-Cy8y9LqY.js`, 303.36 kB

Slutläge efter sprinten:

- `src/App.jsx`: 2470 rader
- initial huvudchunk: `index-CON-NAr7.js`, 102.60 kB
- monolitisk `ai-services`-chunk: borttagen
- största nya sena AI-chunk: `aiCoachDeterministicReplies-MzvoxI9C.js`, 66.74 kB
- övriga sena AI-chunks: `coachReply`, `aiCoachV2Service`, `coachAppContext`, `mealAnalysisService`, `weeklyReportService`, `proactiveCoachService`, `aiUserContext`, `aiApiService`, `aiConversationMemory`, `aiSuggestions`

`dist/index.html` preloadár inte längre någon `ai-services`-chunk.

## Teststrategi

Kontraktstester låser att `App.jsx` inte återinför gamla statiska AI-importer och att loadern använder statiska dynamiska importvägar. Chatcontroller-test verifierar att chatthistorik begränsas till de senaste 10 meddelandena.

## Lägga Till Ny AI-funktion

1. Lägg ren logik i relevant service.
2. Lägg en named loader i `aiRuntimeLoader.js`.
3. Anropa loadern från controller/hook eller lokal feature-callback.
4. Behåll fallback och användartext i befintlig service.
5. Lägg ett kontraktstest så funktionen inte hamnar i `App.jsx` som statisk import.

## Begränsningar

`App.jsx` äger fortfarande flera AI-relaterade UI-statevärden eftersom komponentgränserna är stora. AI Architecture V2 bör bryta ut en React-hook för coachpanelens state och rapportstatus när det kan göras utan UI-risk.
