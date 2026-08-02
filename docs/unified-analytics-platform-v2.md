# Unified Analytics Platform V2

Unified Reports V2 samlar dashboard, rapporter och AI-insikter runt en gemensam deterministisk analysplattform. Målet är att användaren inte ska se olika siffror beroende på om de tittar på Health Dashboard, Weekly Report, Monthly Report, AI Nutrition Insights eller Progress Dashboard.

## Nuläge Före Sprinten

Följande separata logik fanns:

- Health Dashboard V3 använde en egen modell ovanpå progress analytics.
- Weekly Report hade egen vikttrendtext och egen fallbackprioritering.
- Monthly Report hade egen 30-dagarsfiltrering och egen vikt-/måltidssummering.
- AI Nutrition Insights byggde egna coveragevärden.
- Progress Dashboard använde `buildProgressDashboardAnalytics`.

Health Dashboard V3 introducerade redan en bra periodmotor, men den var ännu inte en gemensam rapportplattform.

## Ny Arkitektur

Ny central modul:

`src/services/sharedAnalyticsEngine.js`

Den bygger på befintliga centrala motorer:

- `healthSnapshot`
- `progressAnalytics`
- `healthDashboardPeriodEngine`
- `goalsHabitsSummary`
- `healthCalculations`
- `checkInNormalization` via progress analytics
- nutritionmotorer via progress analytics

Modulen exporterar:

- `buildSharedAnalytics`
- `buildSharedWeeklyReportModel`
- `buildSharedMonthlyReportModel`
- `sharedAnalyticsPeriods`
- `sharedAnalyticsEngineVersion`

## Dataflöde

Appdata går in som färska React-/snapshotvärden:

```text
App.jsx / service input
  -> healthSnapshot
  -> progressAnalytics
  -> healthDashboardPeriodEngine
  -> sharedAnalyticsEngine
  -> dashboardModel / reportModel / AI payload
```

Konsumenter ska inte läsa localStorage direkt för samma fakta. Inga härledda trenddata lagras.

## Shared Trend Engine

Trendserier kommer från `buildTrendSeries` i `healthDashboardPeriodEngine`.

Gemensamma serier:

- vikt
- kalorier
- protein
- steg
- energi

Tomma buckets har `value: null` och `hasData: false`. De räknas inte som noll.

## Shared Comparison Engine

Jämförelser kommer från `compareMetricPeriods`.

Statusar:

- `improved`
- `stable`
- `changed`
- `insufficient`
- `notComparable`

Procent beräknas inte när föregående värde är noll eller för litet.

## Shared Coverage Engine

Coverage beräknas i `buildSharedAnalytics` från:

- viktregistreringsdagar
- loggade måltidsdagar
- check-in-dagar
- periodlängd
- bucket coverage
- confidence

Alla konsumenter får samma `coverage`-objekt.

## Shared Highlight Engine

Highlights skapas centralt från:

- vikttrend
- proteinmål
- aktivitet
- goals/habits
- vald period och bucketstrategi

Rapporter och dashboard använder samma highlightlista.

## Shared Attention Engine

Attention items skapas centralt och är neutrala:

- låg datatäckning
- för lite viktdata
- för lite måltidsdata
- för lite check-in-data
- lång period med luckor
- väntande vanor

Det finns ingen medicinsk tolkning och ingen skuldbeläggning.

## Dashboard

`healthDashboardV2.js` är nu en adapter ovanpå `buildSharedAnalytics`. Dashboarden konsumerar `dashboardModel` och lägger endast till AI-insiktstext från AI Nutrition Insights.

## Weekly Report

`makeWeeklyReportFallback` använder `buildSharedWeeklyReportModel`. Publika fältnamn är oförändrade för UI-kompatibilitet.

## Monthly Report

`createMonthlyHealthReport` använder `buildSharedMonthlyReportModel` och dess period. Den gamla egna “senaste 30 dagar”-definitionen är borttagen ur rapportflödet.

## AI Nutrition Insights

AI Nutrition Insights inkluderar nu `sharedAnalytics.reportModel` och `overview.sharedSummary`. AI får därmed samma fakta som dashboard och rapporter.

## Goals Summary

Goals/habits fortsätter via `buildGoalsHabitsLiteSummary`, men shared analytics använder samma summary i dashboard och rapportmodeller.

## Adapters Som Finns Kvar

Följande adapters finns kvar avsiktligt:

- Weekly Report behåller sitt publika rapportobjekt.
- Monthly Report behåller sitt publika rapportobjekt.
- Health Dashboard behåller `buildHealthDashboardV2Model` som UI-adapter.
- AI Nutrition Insights behåller sina befintliga insightfält för bakåtkompatibilitet.

## Teststrategi

Tester kontrollerar:

- shared analytics är deterministisk
- dashboard och shared analytics har samma viktfakta
- weekly/monthly/dashboard räknar faktiska måltider lika
- planerade måltider exkluderas
- AI Nutrition Insights får shared analytics utan auth/session/token
- highlights och attention items saknar tekniska värden
- native 180/365 från Health Dashboard V3 fortsätter fungera

## Prestanda

Ingen ny dependency har lagts till. Shared analytics återanvänder befintliga motorer och beräknar vald period, inte alla perioder samtidigt.

## Framtida V3

Rimliga nästa steg:

- flytta ännu mer gammal AI-insight-heuristik till shared engines
- låta vecko-/månadsrapporternas UI visa shared trendserier direkt
- lägga arkitekturtester som stoppar nya lokala periodhelpers
- skapa en shared exportmodell för alla rapporttyper
