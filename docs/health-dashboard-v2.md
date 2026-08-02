# Health Dashboard V2

## Nuläge

Viktkollen hade redan:

- Smart AI Dashboard via `dashboardService`
- Smart Progress Dashboard
- ProgressCenter, viktgraf och viktanalys
- Nutrition Dashboard och nutritionrapporter
- check-in-normalisering för energi, humör, steg och träning
- AI Nutrition Insights
- Goals & Habits V3
- vecko- och månadsrapporter
- `healthSnapshot` som centralt kontrakt

Health Dashboard V2 lägger en sammanhållen översikt ovanpå dessa utan att ändra domänlagring, auth, cloud sync, backup, PWA eller AI-säkerhetsregler.

## Datakällor

Dashboardmodellen använder:

- `healthSnapshot`
- central viktdata via progress/health calculations
- faktiska måltider från nutrition/progressmotor
- `normalizeCheckInMetrics`
- `buildProgressDashboardAnalytics`
- `buildGoalsHabitsLiteSummary`
- `buildAiNutritionCoachInsights`

Planerade måltider räknas inte som faktisk nutrition.

## Dashboardmodell

Service:

- `src/services/healthDashboardV2.js`

Modellen är härledd och innehåller:

- `analysisDate`
- `selectedPeriod`
- `dataCoverage`
- `weightSummary`
- `nutritionSummary`
- `activitySummary`
- `checkInSummary`
- `goalsSummary`
- `habitsSummary`
- `insightsSummary`
- `progressHighlights`
- `attentionItems`
- `nextActions`
- `comparisons`
- `sourceStatus`

Ingen auth-, session- eller Supabase-data ingår.

## Perioder

Stödda perioder:

- 7 dagar
- 30 dagar
- 3 månader
- 6 månader
- 12 månader
- hela perioden

Periodvalet sparas som teknisk UI-inställning:

- `viktkollen.healthDashboard.v2.period`

Nyckeln går via `userDataRepository`, men är inte tillagd i sync allowlist. Den är en visningspreferens och inte användarens hälsodata.

## Vikt

Viktkortet visar:

- startvikt
- nuvarande vikt
- målvikt
- total förändring sedan start
- periodförändring
- veckosnitt
- kvar till mål
- datatäckning

Beräkningar återanvänder befintlig progress-/viktlogik. Dashboarden gör ingen separat mål- eller viktmodell.

## Nutrition

Nutritionkortet visar:

- loggade dagar
- faktiska måltider
- genomsnittligt protein
- genomsnittlig energi där data finns
- protein mot mål
- datatäckning

Saknad data beskrivs neutralt och skiljs från lågt intag.

## Aktivitet Och Check-In

Aktivitetskortet visar:

- check-in-count
- genomsnittliga steg
- träningsdagar
- energi
- humör
- jämförelse med föregående period när den är meningsfull

Texten beskriver mönster, inte orsakssamband.

## Mål Och Vanor

Integrationen använder `buildGoalsHabitsLiteSummary`, inte full `GoalsHabitsPanel` eller full streakmotor i startshellen. Arkiverade objekt räknas inte som aktiva. Kortet döljs när det saknar relevant innehåll.

## AI-Insikter

Dashboarden använder den deterministiska AI Nutrition Insights-motorn lokalt. Den visar:

- positiv signal
- förbättringsmöjlighet
- nästa steg
- datatäckning

Ingen AI-server krävs och numeriska fakta ändras inte av AI-text.

## Highlights

Highlights prioriteras stabilt och dedupliceras. De måste baseras på data, till exempel vikttrend, proteinmål, träningsdagar, veckofokus eller lokal insight.

## Attention Items

Attention items är neutrala och begränsade. Saknad data tolkas inte som ett dåligt resultat. Varje punkt får ett konkret nästa steg.

## Jämförelser

Jämförelser bygger på `buildProgressDashboardAnalytics` och visas bara när föregående period finns. Annars används neutral fallback.

## UI Och Drill-Down

Komponent:

- `src/components/HealthDashboardV2.jsx`

Kort länkar till befintliga sektioner:

- vikt/progress
- nutritiondashboard
- check-in
- mål och vanor
- AI-insikter

Ingen mutation sker från dashboardkorten.

## Diagramtillgänglighet

V2 introducerar inga nya diagramdependencies. Vikt- och trenddata har textalternativ i varje kort och en `sr-only` live summary vid periodbyte.

## Empty States Och Demo

Tom data ger neutral fallback:

- börja med vikt, måltid eller check-in
- inga tekniska värden
- inga påhittade samband

Demo mode ändras inte.

## Prestanda Och Lazy Loading

`HealthDashboardV2` lazy-loadas från `App.jsx`. Den fulla komponentkoden ligger i egen featurechunk. Dashboard summary för mål/vanor använder lätt selector och laddar inte `GoalsHabitsPanel`.

## Repository Och Sync

Periodvalet sparas via repository. Härledd dashboarddata lagras inte och syncas inte. Befintlig backup/sync/cloud-arkitektur ändras inte.

## Teststrategi

Tester täcker:

- deterministisk modell
- perioder och jämförelsemetadata
- central viktfakta
- faktisk måltid kontra planerad måltid
- aktivitet/check-in
- goals/habits summary
- tom data
- renderad UI utan tekniska värden

## Manuella Testfall

Kontrollera:

- utloggad appstart
- login/logout
- onboarding
- kort historik
- lång historik
- periodbyte
- viktkort
- nutritionkort
- aktivitetskort
- goals/habits-kort
- AI-insiktskort
- drill-down-länkar
- vecko-/månadsrapport
- backup/restore
- sync/cross-tab
- PWA/offline
- modulepreload

## Kända Begränsningar

- 6- och 12-månadersperioder återanvänder befintlig progressmotor som främst var byggd för 7/30/90/all.
- Dashboarden visar textbaserade trendkort, inte nya grafer.
- Det finns ingen separat dold-kort-inställning i V2.

## Framtida Health Dashboard V3

- Mer detaljerade tillgängliga trenddiagram.
- Separat avancerad drill-down per kort.
- Valbara synliga/dolda kort.
- Mer fullständig periodmotor för 6 och 12 månader i alla underliggande rapporter.
