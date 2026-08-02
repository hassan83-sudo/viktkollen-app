# AI Nutrition Coach V2 + Personal Insights

## Nuläge

Viktkollen har redan deterministiska moduler för vikt, nutrition, check-ins, rapporter, health snapshot och AI Coach. V2 bygger vidare på dessa utan att ändra localStorage-format, auth, cloud sync, PWA eller backup/restore.

## Datakällor

Insiktsmotorn kan använda:

- profil och målvikt
- viktlogg via central viktlogik
- måltider och nutritionmål
- check-ins: energi, humör, sömn, steg och träning
- befintliga datumhelpers för lokal kalenderdag

Planerade måltider räknas inte som faktisk nutrition.

## Insight-Modell

Modellen finns i:

- `src/services/aiNutritionInsights.js`

Varje insight innehåller:

- `id`
- `type`
- `category`
- `priority`
- `title`
- `summary`
- `explanation`
- `evidence`
- `period`
- `confidence`
- `action`
- `status`
- `generatedAt`
- `source`
- `dataCompleteness`
- `dismissible`
- `safetyCategory`

ID:n är stabila per kategori, typ och period. Dubbletter slås ihop via kategori och typ.

## Analysmotor

Motorn analyserar lokalt och deterministiskt:

- vikttrend och förändring sedan start
- kvar till mål när målvikt finns
- protein mot mål
- energiintag mot kalorimål
- måltidsregelbundenhet
- steg och träning från normaliserade check-ins
- låg energi som stödjande signal
- datakvalitet vid för lite data

Alla datum styrs av explicit `analysisDate` i tester och UI.

## Minimikrav På Data

Exempel:

- vikttrend kräver minst två representativa viktvärden
- kostmönster kräver minst två registrerade kostdagar
- aktivitetsinsikter kräver minst två dagar med steg eller relevant check-in-data

När data saknas visas en neutral datakvalitetsinsikt i stället för påhittade slutsatser.

## Scoring Och Prioritering

Insikter sorteras stabilt efter:

- prioritet
- confidence
- kategori
- id

Listan balanseras så minst ett positivt framsteg lyfts först när sådant finns.

## Säkerhetsgränser

Motorn får inte:

- ge medicinska diagnoser
- uppmana till att hoppa över måltider
- ge extrema kost- eller träningsråd
- dra säkra orsakssamband från enkel korrelation
- ge skarpa slutsatser vid för lite data

Misstänkta formuleringar mjukas upp av säkerhetslagret.

## AI-Förädling

V2 skapar en minimerad AI-payload via `buildMinimalInsightAiPayload`.

Payloaden innehåller endast verifierade insikter, evidens och åtgärder. Den innehåller inte:

- auth/session
- tokens
- raw localStorage
- chatthistorik
- fullständiga användardataset

`validateAiInsightRefinement` avvisar AI-text som hittar på nya numeriska fakta eller ger osäkra råd. UI fungerar fullt utan AI-server.

## Lokal Fallback

Alla rubriker, sammanfattningar och åtgärder finns lokalt. Om AI-förädling saknas eller misslyckas används deterministisk text.

## UI

Ny lazy panel:

- `src/components/AINutritionInsights.jsx`

Panelen visar:

- överblick
- viktigaste framsteg
- viktigaste fokus
- nästa steg
- datatäckning
- insight-kort med evidens
- härledd åtgärdsplan
- redigerbar coachfråga

Panelen läggs i befintlig content-grid utan att ändra navigation eller lagring.

## Coachfrågor

Användaren kan välja en insikt, redigera frågan och skicka till befintlig chatthantering. Inget meddelande skickas automatiskt utan knapptryckning.

## Rapportintegration

Motorn exponerar:

- `buildWeeklyPersonalInsightSummary`
- `buildMonthlyPersonalInsightSummary`

Dessa återanvänder samma analysmotor och skapar inte parallella vikt- eller nutritionberäkningar.

## Åtgärdsplan

Åtgärdsplanen är härledd och lagras inte. Den innehåller högst tre förslag med:

- titel
- varför
- konkret nästa steg
- tidsram
- kopplad insight
- status

Ingen ny localStorage-nyckel eller sync allowlist-ändring behövdes.

## Datum Och Tidszon

Motorn använder projektets `localDate`-helpers och explicit analysdatum. Tester är deterministiska och beror inte på systemdag.

## Lazy Loading

`AINutritionInsights` lazy-loadas från `App.jsx`. Analysmotorn hamnar i samma lazy chunk och belastar inte utloggad appstart.

## Syncpåverkan

Ingen persistent data skrivs. Därför behövs ingen ny syncnyckel och ingen ändring i Cloud Sync, scheduler eller cross-tab coordination.

## Teststrategi

Tester täcker:

- deterministiska insikter
- central viktlogik
- otillräcklig data
- dedupe/prioritering
- härledd action plan
- minimerad AI-payload
- AI-validering
- UI-rendering
- vecko-/månadsadaptrar

## Kända Begränsningar

- AI-förädling är förberedd via payload/validering men ingen ny server-AI är inkopplad i V2.
- Åtgärdsplanen är härledd och har ännu inte interaktivt “klar/dölj”-state.
- Rapportadaptrarna finns men befintliga rapportkomponenter ändras minimalt i denna sprint.

## Framtida AI Nutrition Coach V3

- Koppla in optional AI-språkförädling via befintlig AI-runtime.
- Lägg till interaktivt state för action plan med ny teknisk syncnyckel.
- Visa insikter inne i vecko- och månadsrapportens UI.
- Lägg till fler mönster för variation, återhämtning och långsiktig datakvalitet.
