# Coach Actions V5

## Nuläge

Adaptive Coach V4 ger deterministiska rekommendationer och sparar feedback i `viktkollen.adaptiveCoach.v1`. Goals & Habits V3 sparas i `viktkollen.goalsHabits.v2` och Reminder Engine V2 sparas i `viktkollen.reminders.v2`. Appens repository, sync och backup bygger redan på dessa nycklar.

## Arkitektur

`src/services/adaptiveCoachActions.js` är en ren adapter ovanpå befintliga domänmodeller. Den skapar inga egna lagringsnycklar och skriver inte direkt till `localStorage`.

Flödet är:

1. `getCoachActionEligibility()` kontrollerar om ett coachråd får bli action.
2. `buildCoachActionDraft()` skapar ett redigerbart utkast.
3. `validateCoachActionDraft()` validerar text, numerik, confidence, coverage och säkerhet.
4. `findCoachActionDuplicate()` stoppar tydliga dubbletter.
5. `commitCoachActionDraft()` returnerar nya befintliga states för mål/vanor, reminders och coachfeedback.
6. `App.jsx` sparar states via befintliga repository- och `useEffect`-flöden.

## Draftmodell

Draften är härledd och sparas inte automatiskt. Den innehåller bland annat:

- `sourceRecommendationId`
- `actionType`: `goal`, `habit`, `reminder`, `weeklyFocus`
- `title`
- `description`
- `category`
- `target`
- `unit`
- `frequency`
- `activeDays`
- `reminderTime`
- `weekStart`
- `confidence`
- `coverage`
- `safetyCategory`

## Eligibility och säkerhet

Blockerade råd får en neutral svensk orsak och ingen workaround. Blockering sker för medicinska eller extrema råd, låg confidence, låg coverage och råd utan konkret handling. Actionmotorn gör ingen nätverkskommunikation och begär inte notification permission.

## Integrationer

Goal:
Använder `createGoal()` från Goals & Habits och bevarar befintligt schema.

Habit:
Använder `createHabit()` och befintlig streak-/automatiklogik.

Reminder:
Använder `normalizeReminder()` och `validateReminder()` från Reminder Engine V2. Browserpermission begärs inte automatiskt.

Weekly focus:
Använder `acceptWeeklyFocus()` och max tre aktiva fokus per vecka.

## Feedback lifecycle

Feedbackposten kan nu bära:

- `linkedEntityType`
- `linkedEntityId`
- `actionCreatedAt`
- `lastActionStatus`
- `completionSource`

Äldre feedbackdata normaliseras bakåtkompatibelt och raderas inte.

## Coach reprioritization

Adaptive Coach läser feedbackhistorik och actionlinks. En aktiv länkad action gör att samma rekommendation inte föreslås igen. Avfärdade, uppskjutna och slutförda råd fortsätter påverka prioriteringen enligt V4-reglerna.

## Dashboard och rapporter

Health Dashboard visar coach score, aktiva actions, actiontyp och senaste status utan att ladda Goals/Habits- eller Reminder-panelerna.

Weekly Report visar skapade actions, klara actions och conversion.

Monthly Report visar conversion, completion rate och actiontyper.

## Repository, sync och backup

Inga nya lagringsnycklar införs utöver V4-feedbacknyckeln:

- `viktkollen.adaptiveCoach.v1`
- `viktkollen.goalsHabits.v2`
- `viktkollen.reminders.v2`

Persistence går via App-state och repository. `appStorageService` markerar allowlistade nycklar dirty så Global Sync Scheduler kan reagera.

## Prestanda

Actionmotorn importeras av den lazy-laddade Adaptive Coach-panelen och relevanta rapport-/dashboardchunks. Den skapar ingen ny modulepreload och ingen ny dependency.

## Teststrategi

Tester täcker draftmodell, eligibility, säkerhet, dubbletter, goal/habit/reminder/weekly focus-commit, feedback efter lyckad mutation, ingen feedback efter fel, coach dedupe, dashboard och rapporter.

## Manuella testfall

- Skapa mål från coachråd.
- Skapa vana från coachråd.
- Skapa reminder från coachråd.
- Skapa veckofokus från coachråd.
- Försök skapa dubblett.
- Försök skapa osäkert råd.
- Kontrollera att feedback uppdateras först efter lyckad action.
- Kontrollera dashboard, veckorapport, månadsrapport.
- Kontrollera backup/restore och sync genom befintliga nycklar.

## Begränsningar

V5 gör inte djup fuzzy matching. Dubbletter är regelbaserade och deterministiska. Actionformuläret är inbäddat i Adaptive Coach-panelen i stället för en separat tung modal. Completion via säkra automatiska signaler är förberett i modellen men kräver fortsatt produktbeslut i V6.

## Framtida V6

- Tydligare navigering till exakt mål/vana/reminder.
- Slutförande via säkra deterministiska signaler.
- Mer granulär actionhistorik per period.
- Separat lazy actionformulär om panelen växer.
