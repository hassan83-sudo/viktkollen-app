# Insights & Trends V1

## Nuläge

Viktkollen hade redan flera analyslager:

- `sharedAnalyticsEngine.js` för gemensamma perioder, coverage, trends och rapportmodeller.
- `progressAnalytics.js` för vikt, perioder, prognos, nutrition och habits.
- `weeklyReportService.js` och `monthlyReportService.js` för rapporter.
- `healthDashboardV2.js` för dashboardmodellen.
- Adaptive Coach V7 för feedback, timeline, patterns och actions.
- Notifications V3 under `viktkollen.reminders.v2.notificationsV3`.
- Nutrition Scanner V3 via `nutritionPhotoAnalysis`.
- Cloud Sync V3 som status- och konfliktkälla.

Insights V1 bygger ovanpå dessa och skapar ingen ny auth, databas, backupmodell, syncmodell eller localStorage-nyckel.

## Central motor

Ny modul:

`src/services/insights/insightsEngine.js`

Motorn är helt regelbaserad. Den använder befintlig appdata som skickas in från App.jsx, rapporter och dashboard. Konsumenter ska inte läsa localStorage direkt för samma fakta.

## Output

Motorn returnerar:

- `trends`
- `milestones`
- `consistency`
- `momentum`
- `adherence`
- `coverage`
- `confidence`
- `improvementSignals`
- `regressionSignals`
- `insights`
- `score`

Alla texter bygger på observerat underlag. När data saknas returneras neutrala fallbacktexter.

## Trends

V1 analyserar:

- vikttrend
- proteintrend
- kaloritrend
- stegtrend
- check-in/energisignal
- reminder completion
- coach acceptance
- habit consistency
- goal completion
- nutrition scanner usage

## Milestones

Milstolpar identifieras från:

- längsta viktstreak
- måltidsstreak
- check-in-streak
- coach completed
- reminders completed
- nutrition scanner usage

## Regression

Regressioner uttrycks neutralt:

- minskad aktivitet
- färre check-ins
- fler uppskjutna reminders
- vanor som väntar på uppföljning

## UI och rapporter

Ny lazy panel:

`src/components/InsightsCenter.jsx`

Health Dashboard visar Insight Score, Momentum och Consistency. Weekly Report och Monthly Report visar förbättringar, förändringar, consistency, långtidstrender och milestones när modellen finns.

## Launch Readiness

Launch Readiness visar analytics health, insight generation och trend coverage.

## Begränsningar

Insights V1 jämför främst första och andra halvan av vald period. Den är avsiktligt konservativ och undviker kausalitet. Mer avancerade säsongsjämförelser kan byggas i en senare sprint ovanpå samma motor.
