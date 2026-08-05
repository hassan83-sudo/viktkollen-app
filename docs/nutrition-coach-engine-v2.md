# Nutrition Coach Engine V2

## Syfte

Nutrition Coach Engine V2 lägger ett regelbaserat coachlager ovanpå befintlig nutrition, scannerhistorik, Adaptive Coach, Coach Memory, Action Plans, Insights, Notifications och OpenAI-integrationen.

Den skapar ingen ny auth, sync, backupmodell eller separat lagring. UI:t är lazy-loadat och PWA-arkitekturen lämnas oförändrad.

## Huvudmoduler

- `src/services/nutrition/nutritionCoachEngine.js`
- `src/components/NutritionCoachCenter.jsx`

Motorn importeras direkt av den lazy-loadade panelen och exponeras inte via den stora nutrition-barrelen, så den inte dras in i initial appstart.

## Meal Quality Score

Varje måltid får ett poängvärde mellan 0 och 100.

Poängen bygger på:

- protein
- grönsaker
- fiber
- processad mat
- socker
- hälsosamma fetter
- måltidsbalans

Varje delpoäng innehåller en kort förklaring så användaren kan se varför måltiden fick sitt resultat. Poängen är ungefärlig och regelbaserad, inte medicinsk rådgivning.

## Daily Nutrition Timeline

Motorn bygger en daglig tidslinje med:

- Frukost
- Lunch
- Middag
- Mellanmål

Saknade måltider markeras neutralt. Planerade måltider räknas inte som faktiskt intag.

## Nutrition Gaps

Motorn identifierar praktiska luckor, till exempel:

- lågt protein jämfört med mål
- låg fiber
- få grönsaker
- energitäta måltider
- många söta eller processade val

Luckorna uttrycks neutralt och med konkreta nästa steg.

## Smart Food Suggestions

Förslag skapas från befintliga preferenser och filtrering.

Motorn tar hänsyn till:

- preferred foods
- disliked foods
- allergies när de finns konfigurerade
- budgetvänliga val
- snabba måltider

Förslagen använder befintliga dietary preference-regler och skapar ingen ny preferensmodell.

## NutritionCoachCenter

`NutritionCoachCenter` visar:

- måltidskvalitet
- daily score
- weekly score
- nutrition gaps
- rekommendationer
- score-förklaringar
- smarta matförslag
- confidence score
- AI refinement-status

Panelen lazy-loadas från `App.jsx` och ska inte modulepreloadas i production.

## Consent-Gated AI Refinement

Remote AI får endast användas när:

- befintligt remote coach-samtycke finns
- remote coach är aktiverad
- användaren trycker på förfiningsknappen
- payloaden är minimerad

Payloaden innehåller endast aggregerade nutrition metrics, måltidskategorier och counts. Den innehåller inte råbilder, rå historik, authdata, tokens eller komplett användardata.

Om remote AI saknas eller misslyckas fungerar panelen med lokal deterministisk text.

## Lazy Loading

Release gate kontrollerar att följande inte modulepreloadas:

- `NutritionCoachCenter`
- `nutritionCoachEngine`

Motorn hålls utanför initial appstart och laddas först när Nutrition Coach Center används.

## Kända Begränsningar

- Måltidskvaliteten är ungefärlig och beror på befintliga nutritionfält och livsmedelsmatchning.
- AI refinement kan endast ge språkförädling inom befintliga säkerhets- och samtyckesgränser.
- Motorn gör inga medicinska bedömningar och ska inte användas som diagnos eller behandlingsråd.
- Om mål eller historik saknas används neutral fallback och lägre confidence.
