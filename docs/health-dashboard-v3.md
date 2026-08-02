# Health Dashboard V3

Health Dashboard V3 bygger vidare på V2 utan att ändra lagringsformat, auth, cloud sync, PWA eller AI-säkerhetsregler. Dashboarden är fortfarande en härledd read-only vy som får färsk appdata via `App.jsx` och bygger en deterministisk modell i `src/services/healthDashboardV2.js`.

## V2-nuläge

V2 lazy-loadades som `HealthDashboardV2` och samlade vikt, nutrition, check-ins, goals/habits och AI nutrition insights. Perioderna `180d` och `365d` fanns i UI:t men skickades tidigare vidare som `all` till progressanalysen. Det gjorde långa perioder mindre exakta än 7/30/90 dagar.

## Native Long-Range Architecture

V3 lägger till `src/services/healthDashboardPeriodEngine.js`. Den modulen ansvarar för perioddefinitioner, datumintervall, föregående period, bucketstrategi, trendserier och jämförelsestatus.

Progressmotorn har nu native perioder:

- `7d`
- `30d`
- `90d`
- `180d`
- `365d`
- `all`

Health Dashboard V3 skickar vald period direkt till `buildProgressDashboardAnalytics`. Det finns inte längre en specialfallback där `180d` eller `365d` blir `all`.

## Periodmotor

Periodmotorn kräver ett explicit `analysisDate`. Tester ska inte bero på faktisk systemdag.

Varje periodmodell innehåller:

- `id`
- `label`
- `start`
- `end`
- `calendarDays`
- `completedDays`
- `ongoingDay`
- `previousPeriod`
- `previousStart`
- `previousEnd`
- `bucketStrategy`
- `expectedDataPoints`
- `periodLabel`
- `comparisonLabel`
- `isPartialPeriod`

`all` använder tidigaste tillgängliga lokala kalenderdatum som start och har ingen föregående jämförbar period.

## Buckets

Bucketstrategin är deterministisk:

- 7 och 30 dagar: dag
- 90 och 180 dagar: vecka
- 365 dagar: månad
- all: dag, vecka eller månad beroende på faktisk datamängd

Tomma buckets representeras som saknad data med `value: null` och `hasData: false`. De tolkas inte som nollintag, noll steg eller noll vikt.

## Jämförelsemotor

`compareMetricPeriods` returnerar:

- absolut skillnad
- procentuell skillnad endast när nämnaren är rimlig
- trendriktning
- confidence
- comparisonStatus
- text

Statusar:

- `improved`
- `stable`
- `changed`
- `insufficient`
- `notComparable`

Procent beräknas inte från noll eller mycket små värden. Om datatäckningen skiljer sig för mycket markeras jämförelsen som `notComparable`.

## Trendserier

`buildTrendSeries` skapar återanvändbara diagramserier med:

- `id`
- `label`
- `unit`
- `points`
- `bucketType`
- `start`
- `end`
- `min`
- `max`
- `average`
- `trend`
- `coverage`
- `textualSummary`

Trendserierna är härledda och lagras inte.

## Vikttrender

Viktkortet visar en lätt SVG-baserad trendgraf:

- korta perioder använder dagsvärden
- 90/180 dagar använder veckobuckets
- 365/all kan använda månadsbuckets
- saknad data blir inte noll
- textalternativ finns via `aria-label`, `title` och `desc`

Målvikt och total viktfakta fortsätter komma från central progress-/viktmodell.

## Nutritiontrender

Nutritionserierna bygger på faktiska måltider från progressanalysen. Planerade måltider räknas inte som genomfört intag. V3 visar separata serier för energi och protein i stället för att blanda enheter på samma otydliga skala.

## Aktivitet och check-in

Aktivitetsserierna bygger på normaliserade check-ins:

- steg
- energi

Energi och humör används inte som medicinska mått. Dashboarden drar inga kausala slutsatser mellan aktivitet, humör, energi eller vikt.

## Goals/Habits

Goals och habits sammanfattas fortsatt via `buildGoalsHabitsLiteSummary`. Dashboarden muterar inte goals/habits och skapar inga egna streakregler. Pausade eller arkiverade poster hanteras i goals/habits-lagret.

## Highlights och Attention Items

V3 lägger till periodmedvetna signaler:

- kort period: aktuell konsekvens
- 90/180 dagar: långsiktigt mönster
- 365/all: årsöversikt eller total utveckling

Attention items är neutrala och fokuserar på datatäckning, luckor och konkreta nästa steg. Saknad data beskrivs inte som dåligt beteende.

## Drill-down

Detaljvyn ligger i `src/components/HealthDashboardDrilldown.jsx` och lazy-loadas från dashboarden.

Den visar:

- vald period
- jämförelseperiod
- trendserier
- coverage
- senaste datapunkter
- beräkningsförklaring

Escape stänger detaljvyn och fokus återgår till knappen.

## Export

V3 har en användarinitierad textöversikt via knappen `Exportera översikt`.

Exporten innehåller:

- vald period
- datum
- vikt
- nutrition
- aktivitet
- jämförelse
- datatäckning
- highlights

Exporten innehåller inte auth, session, tokens eller rå localStorage-dump.

## Repository och inställningar

V3 återanvänder V2:s tekniska inställningsnyckel:

`viktkollen.healthDashboard.v2.period`

Ingen ny nyckel behövdes. Periodvalet är en UI-inställning. Härledda trenddata, jämförelser och buckets lagras inte.

## Prestanda

Health Dashboard V3 fortsätter lazy-loadas från `App.jsx`. Drilldown-delen lazy-loadas separat. Ingen ny dependency lades till.

V3 beräknar endast vald period och inte alla perioder samtidigt.

## Teststrategi

Tester täcker:

- 7/30/90/180/365/all
- föregående period
- skottår
- årsskifte
- buckets
- tomma buckets
- trendserier
- nollnämnare i jämförelser
- låg datatäckning
- native 180/365 i dashboarden
- exportöversikt utan känsliga fält
- UI-kontrakt för aria och periodkontroller

## Manuella Testfall

Kontrollera:

- appstart utloggad
- inloggning och utloggning
- 180 dagar
- 365 dagar
- all
- kort historik
- mer än 365 dagars historik
- tom nutrition
- sporadisk nutrition
- check-ins runt datumgränser
- drilldown med tangentbord
- Escape från drilldown
- exportknapp
- PWA offline/install/update
- sync/backup utan ändrade datamodeller

## Kända Begränsningar

Dashboarden visar lättviktsdiagram utan avancerade tooltips. Tooltips är inte enda informationskälla. Goals/habits använder fortsatt lite-sammanfattningen och inte en full långperiods-streakanalys per dashboardperiod. `all` väljer bucketstrategi efter datamängd men gör ingen föregående periodjämförelse.

## Health Dashboard V4

Rimliga nästa steg:

- dela upp fler kort i lazy-drilldowns
- återanvänd trendserier i vecko- och månadsrapporter
- mer detaljerad goals/habits-periodanalys
- utskriftsvänlig exportvy
- visuell kontroll för valbar nutritionserie
