# Adaptive Coach V7

## Nuläge

Adaptive Coach V7 bygger ovanpå befintliga V3-V6-delar:

- `adaptiveCoachEngine.js` skapar max tre deterministiska coachrekommendationer från shared analytics, nutrition insights, goals/habits och reminders.
- `adaptiveCoachFeedback.js` lagrar feedback och timeline-events i `viktkollen.adaptiveCoach.v1`.
- `adaptiveCoachActions.js` skapar mål, vanor, reminders och veckofokus via befintliga domänmodeller.
- `adaptiveCoachTimeline.js` förklarar feedback, länkade actions och outcomes.

V7 skapar inga nya lagringsnycklar och ingen ny sync- eller backupmodell.

## Pattern Architecture

`src/services/adaptiveCoachPatterns.js` analyserar endast observerad lokal data:

- faktiska måltider, inte planerade måltider
- check-ins, steg, energi och träning
- viktregistreringar
- feedback, actions och timeline-events

Resultat är härledda objekt med `id`, `category`, `patternType`, `period`, `evidence`, `supportingDates`, `sampleSize`, `coverage`, `confidence`, `direction`, `strength`, `textualSummary`, `limitations`, `recommendedResponse`, `safetyCategory` och `eligibility`.

## Eligibility

Tillåtna statusar är `supported`, `tentative`, `insufficient`, `notComparable` och `blocked`.

- `supported`: flera observationer och rimlig täckning.
- `tentative`: användbart men begränsat underlag.
- `insufficient`: för lite data; visas inte som negativt resultat.
- `notComparable`: grupper kan inte jämföras rättvist.
- `blocked`: säkerhetsregler stoppar text eller slutsats.

Enstaka datapunkter får inte bli säkra mönster.

## Veckodag, Helg Och Tid

Vardag/helg jämförs bara när båda grupperna har flera observationer. Tidsmönster använder grova intervall, till exempel förmiddag, middag, kväll och natt. Saknade eller osäkra tidsstämplar ignoreras.

## Action Effectiveness

Coachens effectiveness bygger på samma facts som V6 timeline: accepterade, slutförda, uppskjutna, avfärdade och länkade actions. Avfärdade råd räknas inte som misslyckanden.

## Strategy Model

`src/services/adaptiveCoachStrategy.js` väljer regelbaserat mellan:

- `reinforceSuccess`
- `simplifyAction`
- `improveCoverage`
- `continueActiveAction`
- `suggestWeeklyFocus`
- `suggestReminder`
- `suggestHabit`
- `waitForMoreData`
- `rotateCategory`

Strategin beskriver appens val av stöd, inte användarens personlighet eller framtida beteende.

## Weekly Plan Draft

`src/services/adaptiveCoachWeeklyPlan.js` skapar ett redigerbart utkast med vecka, rationale, fokusområden, föreslagna actions, befintliga actions, confidence, coverage och säkerhetsnotis.

Planutkast sparas inte automatiskt. Bekräftade actions går genom Coach Actions V5 och befintliga states:

- goals/habits via `viktkollen.goalsHabits.v2`
- reminders via `viktkollen.reminders.v2`
- feedback/timeline via `viktkollen.adaptiveCoach.v1`

## Confirmation Flow

`src/components/AdaptiveCoachWeeklyPlan.jsx` lazy-loadas från `AdaptiveCoachPanel`. Användaren kan redigera titel, handling, typ och tid, välja bort actions, bekräfta valda actions eller avbryta.

Multi-action commit:

1. Validerar alla valda actions.
2. Kontrollerar dubbletter.
3. Använder in-memory pre-commit state.
4. Skapar actions i stabil ordning.
5. Uppdaterar feedback/timeline efter lyckad action.
6. Returnerar originalstate vid preflight- eller commitfel.

Full atomisk rollback mot redan skriven `localStorage` behövs inte i UI-flödet eftersom komponenten först får ett resultat och därefter skickar nya states till App.jsx.

## Timeline

V7 tillåter timeline-event för pattern/strategy/plan-lifecycle, bland annat `weeklyPlanDraftOpened`, `weeklyPlanConfirmed`, `weeklyPlanCancelled`, `planActionCreated` och `duplicatePrevented`. Rå pattern-payload sparas inte.

## Dashboard Och Rapporter

Health Dashboard, Weekly Report och Monthly Report visar korta V7-sammanfattningar från samma pattern- och strategimodeller. De bygger inte egen parallell analys.

## Repository, Sync Och Backup

V7 lagrar inte patternresultat, strategi eller planutkast. Endast bekräftade actions och timeline-events hamnar i befintliga lagringsnycklar, vilket gör att befintlig repository-, sync- och backup/restore-logik fortsätter gälla.

## Privacy And Safety

Textvalidering neutraliserar medicinska prognoser, säker framtidsretorik, profilering, skuld, extrem kost/träning och uppmaningar att hoppa över måltider. Ingen nätverkskommunikation eller extern analys används.

## Performance

`AdaptiveCoachPanel` är redan lazy-loaded från App.jsx. V7:s veckoplan-UI lazy-loadas separat från panelen. Pattern- och strategimotorerna importeras i panelens lazy chunk och i redan valfria dashboard/rapportflöden.

## Teststrategi

Tester täcker deterministiska mönster, eligibility, planutkast utan persistence, multi-action commit, dubblettstopp, rollback, säker text, lazy loading och server-renderad UI utan tekniska displayvärden.

## Manuella Testfall

- Ny användare med låg datatäckning.
- Flera veckors måltider och check-ins.
- Vardag/helg-skillnad.
- Aktiv goal, habit, reminder och weekly focus.
- Öppna veckoplan, redigera, avbryt, bekräfta en action och bekräfta flera.
- Dubblettförslag stoppas.
- Timeline visar planhändelser.

## Begränsningar

V7 gör inga medicinska bedömningar och skapar ingen automatisk veckoplan utan användarbekräftelse. Patternresultat är härledda vid körning och sparas inte för historisk jämförelse. Full browservalidering för multi-device sync kräver fortsatt manuell release-acceptans med riktiga konton.

## V8

Möjliga nästa steg är bättre jämförelse över längre perioder, tydligare plan-outcome-uppföljning och fler a11y-fokuserade browserflöden för veckoplanen.
