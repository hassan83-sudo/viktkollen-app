# AI Health Journey V1

AI Health Journey V1 ar ett centralt, read-only lager som binder ihop befintliga modeller till en begriplig halsotidslinje. Det skapar ingen ny auth, databas, syncmodell, backupmodell eller lagringsnyckel.

## Filer

- `src/services/healthJourney/healthJourneyModel.js`
- `src/services/healthJourney/healthJourneyBuilder.js`
- `src/services/healthJourney/healthJourneySummary.js`
- `src/components/HealthJourneyCenter.jsx`

## Modell

Varje event innehaller stabila, anvandarsakra falt:

- `id`
- `type`
- `category`
- `occurredAt`
- `period`
- `title`
- `summary`
- `explanation`
- `source`
- `confidence`
- `dataCoverage`
- `importance`
- `tone`
- `derived`
- `userVisible`
- `relatedEntityType`
- `relatedEntityIdMasked`
- `limitations`

Tillatna eventtyper ar bland annat viktprogress, meal quality, nutrition gaps, check-in trend, goals/habits, coach actions, achievements, predictions, opportunities och caution signals.

## Builder

`buildHealthJourney()` ateranvander:

- Shared Analytics
- Insights Engine
- Nutrition Coach Engine
- Predictive Health Intelligence
- Adaptive Coach Timeline
- Coach Actions
- Achievement Engine

Journey events ar deterministiska, deduplicerade och sorterade stabilt. Flera lagvarde-events per dag begransas, medan viktiga milestones och prediction/caution-events kan bevaras.

## Summary

`buildHealthJourneySummary()` ger:

- current phase
- starkaste positiva trend
- aktuellt fokus
- senaste milestone
- caution signal
- opportunity
- data coverage
- confidence
- limitations

Dashboard, weekly report och monthly report konsumerar en kompakt `journey` summary. Full timeline visas endast i `HealthJourneyCenter`.

## AI Refinement

Remote AI far endast anvandas efter aktivt samtycke och knapptryck. `buildMinimalHealthJourneyAiPayload()` skickar endast:

- journey summary
- milestone categories
- current opportunity
- current caution
- confidence
- coverage
- limitations
- user question

Full timeline, raw events, raw history, ID:n, auth/session, prompts, provider responses, bilder och exportdata skickas inte.

## Performance

`HealthJourneyCenter` lazy-loadas fran `App.jsx`. Release-gaten kontrollerar att `HealthJourneyCenter` och `healthJourneyBuilder` inte modulepreloadas initialt.

## Begransningar

- Journey ar harledd och persisteras inte.
- Prognoser visas endast som prognoser och skriver inte om historik.
- Saknad data ar neutral och betyder inte daliga vanor.
- Ingen medicinsk diagnos eller kausalitet visas.
