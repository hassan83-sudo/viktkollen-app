# Coach Timeline V6

## Nuläge

Adaptive Coach har feedback i `viktkollen.adaptiveCoach.v1`, Coach Actions använder befintliga mål/vanor och reminders, och dashboard/rapporter visar coachstatus. V6 bygger en sammanhängande historik utan ny lagringsnyckel.

## Timeline Architecture

`src/services/adaptiveCoachTimeline.js` bygger en deterministisk tidslinje från:

- `adaptiveCoachFeedback.recommendations`
- `adaptiveCoachFeedback.history`
- `adaptiveCoachFeedback.events`
- länkade mål, vanor och veckofokus i `viktkollen.goalsHabits.v2`
- länkade reminders i `viktkollen.reminders.v2`
- aktuell coachmodell när den finns

Full UI ligger i `src/components/AdaptiveCoachTimeline.jsx` och lazy-loadas från `AdaptiveCoachPanel`.

## Eventmodell

Timeline-event innehåller bland annat:

- `id`
- `eventType`
- `recommendationId`
- `occurredAt`
- `title`
- `summary`
- `category`
- `status`
- `source`
- `linkedEntityType`
- `linkedEntityId`
- `actionType`
- `previousStatus`
- `nextStatus`
- `reason`
- `confidence`
- `coverage`
- `outcome`
- `isDerived`
- `isHistorical`
- `safetyCategory`

## Explicita och härledda events

Explicita events sparas i `adaptiveCoachFeedback.events` med ringbuffer. Härledda events skapas vid läsning från feedback och länkade actions. Äldre V4/V5-data utan `events` fungerar därför fortfarande.

## Lagringskompatibilitet

Ingen ny lagringsnyckel har lagts till. `normalizeAdaptiveCoachFeedback()` accepterar äldre state utan `events` och okända eventtyper ignoreras säkert. Historiken begränsas för att undvika växande payload.

## Eventregistrering

`appendCoachTimelineEvent()` validerar eventtyp, sanerar text, skapar stabilt id, deduplicerar och begränsar historiken.

V6 registrerar explicit event vid feedbackstatus och skapade coachactions. Blockerade dubbletter kan registreras från UI när användaren försöker spara.

## Outcome Resolver

`resolveCoachActionOutcome()` läser länkade objekt:

- mål
- vanor
- reminders
- veckofokus

Outcomes kan vara `active`, `progressing`, `completed`, `paused`, `archived`, `skipped`, `dismissed`, `postponed`, `unknown` eller `insufficient`. Saknade länkar ger `unknown`.

## Adaptation Explanations

`explainCoachAdaptation()` ger korta regelbaserade förklaringar, till exempel:

- aktiv action finns redan
- råd har nyligen avfärdats
- råd är uppskjutet
- liknande action slutfördes
- datatäckningen är låg

Inga psykologiska profiler eller medicinska slutsatser skapas.

## UI och Filter

Timeline-vyn visar datum, rekommendation, actiontyp, status, outcome och detaljer. Filter finns för period, kategori, status och actiontyp. Detaljer använder `aria-expanded` och filterändring annonseras med `aria-live`.

## Dashboard och Rapporter

Health Dashboard använder en lätt selector och laddar inte full timeline.

Weekly och Monthly Report visar timeline summary: händelser, created actions, uppskjutna, avfärdade, completion/conversion och fokusförändring.

## Navigation

Timeline länkar till relevanta befintliga sektioner:

- `#adaptive-coach`
- `#mal-vanor`
- `#reminder-center`

Ingen routerdependency införs.

## Export

Ingen export lades till i V6. Befintlig rapportexport är inte direkt anpassad för anonymiserad coachhistorik utan rå data, så export skjuts till V7.

## Repository, Sync och Backup

All persistence fortsätter via repository och befintliga nycklar:

- `viktkollen.adaptiveCoach.v1`
- `viktkollen.goalsHabits.v2`
- `viktkollen.reminders.v2`

Sync allowlist behöver ingen ny nyckel. Backup/restore inkluderar events via befintlig coachnyckel.

## Integritet och Säkerhet

Timeline beskriver apphändelser, inte användarens personlighet. Den visar inga auth/sessionfält, rå AI-payload eller fullständiga interna id:n i UI.

## Prestanda

Full timeline-vy lazy-loadas. Dashboard och rapporter använder summary-selector. Lång historik begränsas till de senaste events i renderingen utan ny dependency.

## Teststrategi

Tester täcker eventmodell, sortering, dedupe, äldre feedback, outcomes, adaptationförklaring, summary, UI-rendering, lazy-kontrakt, rapporter och PWA/modulepreload.

## Manuella Testfall

- Ny användare utan historik.
- Äldre V4/V5-feedback.
- Accept, postpone, dismiss, completed.
- Skapa mål, vana, reminder och veckofokus från coach.
- Blockerad dubblett.
- Länkad action pausas eller arkiveras.
- Timelinefilter och lång timeline.
- Dashboard, Weekly Report och Monthly Report.
- Backup/restore, global sync och PWA.

## Begränsningar

- Ingen coachhistorikexport i V6.
- Ingen automatisk completion via domänsignaler utöver säkra länkade statusar.
- UI länkar till sektioner, inte exakt objekt-rad.

## Framtida V7

- Säker anonymiserad export.
- Djupare navigation till exakt objekt.
- Mer detaljerad outcome-historik per action.
- Möjlig lätt pagination om historiken växer ytterligare.
