# Unified Reports UI V3

Unified Reports UI V3 gör vecko- och månadsrapporterna till presentationslager ovanpå Shared Analytics Engine. Rapporterna behåller sina gamla publika fält för bakåtkompatibilitet, men visar nu samma perioder, trendserier, comparisons, coverage, highlights och attention items som Health Dashboard V3.

## Nuläge Före Sprinten

Efter Unified Reports V2 fanns:

- `sharedAnalyticsEngine`
- Health Dashboard V3 med trendserier och coverage
- Weekly Report och Monthly Report som använde shared analytics via serviceadapters

Rapporternas UI visade däremot främst gamla summaryfält. Trendserier, comparisonstatus, coverage och attention items presenterades inte direkt.

## Shared Report UI Architecture

Ny presentationstjänst:

`src/services/sharedReportUiModel.js`

Den skapar ett härlett UI-kontrakt från `report.sharedAnalytics`:

- `reportType`
- `period`
- `periodLabel`
- `comparisonLabel`
- `coverage`
- `confidence`
- `overview`
- `trendCards`
- `comparisonCards`
- `highlights`
- `attentionItems`
- `goalsHabits`
- `nextActions`
- `dataQuality`
- `generatedAt`
- `textualSummary`

Modellen lagras inte och läser inte localStorage.

## Delade Komponenter

Nya presentationskomponenter finns i `src/components/reports/`:

- `ReportOverview`
- `ReportCoverage`
- `ReportTrendCard`
- `ReportTrendChart`
- `ReportComparisonCard`
- `ReportHighlights`
- `ReportAttentionItems`
- `ReportGoalsHabits`
- `ReportNextActions`

Komponenterna räknar inte om analysfakta. De renderar färdiga fält från `sharedReportUiModel`.

## Weekly Report V3

Weekly Report visar nu:

- period och datatäckning
- vikt, nutrition och aktivitet
- trendkort för vikt, energi, protein och steg
- jämförelse mot föregående 7 dagar
- highlights
- attention items
- mål och vanor
- nästa rimliga steg

Den gamla rapporttexten finns kvar under V3-sektionerna.

## Monthly Report V3

Monthly Report visar nu:

- 30-dagarsperiod från Shared Analytics
- shared overview
- coverage/progressbar
- trendkort
- comparison cards
- highlights
- attention items
- mål och vanor
- nästa steg

De gamla månadskorten och AI-sammanfattningen finns kvar för kompatibilitet.

## Trenddiagram

Rapporterna återanvänder en lätt SVG-modell:

- ingen ny chartdependency
- `role="img"`
- `title` och `desc`
- saknade buckets räknas inte som noll
- tomma serier visar neutral empty state

## Comparisons

Comparison cards visar:

- status
- nuvarande värde
- föregående värde
- skillnad
- procent endast när Shared Analytics tillåter det
- coverage nu/före

Statusar kommer från shared comparison engine:

- `improved`
- `stable`
- `changed`
- `insufficient`
- `notComparable`

## Coverage och Confidence

`ReportCoverage` visar datatäckning med text och progressbar. Progressbaren har:

- `role="progressbar"`
- `aria-valuemin`
- `aria-valuemax`
- `aria-valuenow`
- `aria-valuetext`

Confidence visas som datakvalitet, inte som medicinsk säkerhet.

## Highlights och Attention Items

Rapporterna visar shared highlights och attention items direkt. UI:t gör ingen egen prioritering.

Saknad data beskrivs neutralt och aldrig som misslyckande.

## Goals/Habits

Rapporterna visar shared goals/habits summary och länkar till `#mal-vanor`. Full GoalsHabitsPanel laddas inte av rapportkomponenterna.

## AI och Fallback

Rapporterna fungerar utan AI-server. AI får fortfarande formulera befintliga rapporttexter, men V3-fakta kommer från shared analytics och UI-kontraktet.

## Export och Utskrift

V3 lägger till användarinitierad utskrift via `Skriv ut rapport`. Det använder webbläsarens printflöde och exporterar inte auth, session, tokens, raw localStorage eller diagnostics.

## Empty States

Tomma eller otillräckliga serier visar neutral text, exempelvis att fler datapunkter behövs för diagram. Rapporterna visar fortfarande det som finns.

## Accessibility

V3 använder:

- tydliga rubriker
- progressbar-ARIA
- diagramtextalternativ
- länkar till källvyer
- printläge med renare läsordning
- ingen färg som enda informationsbärare

## Prestanda och Lazy Loading

Weekly Report är del av ProgressDashboard-flödet och använder små statiska presentationskomponenter. Monthly Report fortsätter vara lazy via appens befintliga struktur och monthly service laddas dynamiskt.

Shared Analytics flyttas inte till initial bundle.

## Teststrategi

Tester verifierar:

- UI-modell för weekly/monthly
- trend cards
- diagramtextalternativ
- progressbar
- shared sections i Weekly Report
- shared sections i Monthly Report
- faktakonsistens mellan rapportmodell och shared analytics
- inga tekniska värden i renderad UI

## Kända Begränsningar

Rapportdiagrammen är avsiktligt enkla SVG-diagram. De visar inte avancerade tooltips eller interaktiva zoomlägen. Utskrift är webbläsarbaserad, inte en separat PDF-export.

## Unified Reports V4

Rimliga nästa steg:

- lazy-loadade expanderbara rapportdrilldowns
- textbaserad rapport-export till fil
- shared print template för alla rapporttyper
- fler comparison cards när shared analytics exponerar fler domäner
- arkitekturtest som stoppar analyslogik i rapport-JSX
