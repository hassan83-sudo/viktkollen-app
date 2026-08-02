# Goals, Habits & Streaks V2

## Nuläge

Viktkollen hade redan flera mål- och vaneliknande delar:

- målvikt i profil/progress
- nutritionmål
- matchecklista
- daglig check-in med energi, humör, steg och träning
- måltidslogg och planerade måltider
- viktlogg
- ReminderSettings
- AI Nutrition Insights
- vecko- och månadsrapporter
- local-first repository, backup/restore, Cloud Sync och cross-tab-signaler

V2 lägger ett samlat, lätt mål- och vanelager ovanpå dessa. Befintliga domänformat ändras inte och ingen historisk användardata migreras.

## Lagring

Ny teknisk nyckel:

- `viktkollen.goalsHabits.v2`

Schema:

- `schemaVersion`
- `goals`
- `habits`
- `completions`
- `weeklyFocus`

Nyckeln läses och skrivs via `userDataRepository`. Repositoryt använder `appStorageService`, vilket innebär att samma dirty-event, backup-snapshot och cross-tab-mekanismer som övriga allowlistade användardata används. Komponenter ska inte läsa eller skriva `localStorage` direkt för mål och vanor.

## Sync Och Backup

`viktkollen.goalsHabits.v2` är tillagd i `syncStorageAllowlist`. Nyckeln innehåller inga auth-, session-, Supabase- eller tokenfält. Backup/restore inkluderar nyckeln via repositoryns backupnycklar eftersom den ligger i `userDataKeys` och inte matchar känsliga backupmönster.

Rå payload skickas inte via BroadcastChannel. Sync-lagret får bara veta att en allowlistad nyckel ändrats.

## Målmodell

Ett mål normaliseras till:

- `id`
- `type`
- `category`
- `title`
- `description`
- `target`
- `unit`
- `period`
- `startDate`
- `targetDate`
- `status`
- `source`
- `progressMode`
- `createdAt`
- `updatedAt`
- `completedAt`
- `archivedAt`
- `linkedDataSource`
- `safetyCategory`

Stödda kategorier i V2:

- vikt
- protein
- måltidsloggning
- steg
- träning
- check-in
- egen vana
- veckofokus

Viktmål duplicerar inte profilen som en konkurrerande källa. När viktprogress räknas används den centrala viktmodellen via `getUnifiedWeightFacts`.

Defensiva gränser:

- viktmål under 35 kg eller över 300 kg avvisas
- proteinmål under 20 g eller över 300 g avvisas
- stegmål under 500 eller över 50000 steg avvisas
- icke-positiva automatiska mål avvisas

## Vanemodell

En vana normaliseras till:

- `id`
- `title`
- `category`
- `frequency`
- `targetCount`
- `activeDays`
- `trackingMode`
- `linkedDataSource`
- `reminderReference`
- `status`
- `startDate`
- `createdAt`
- `updatedAt`
- `pausedAt`
- `archivedAt`

Tracking modes:

- `automatic`
- `manual`
- `hybrid`

Automatiska vanor räknas från befintlig appdata:

- viktlogg
- verkliga måltider
- protein per dag
- steg i check-in
- träning i check-in
- check-in finns

Planerade måltider räknas inte som genomförd måltidsloggning.

## Progressmotor

Service:

- `src/services/goalsHabits.js`

Motorn tar explicit `analysisDate` och använder projektets `localDate`-helpers. Tester använder fasta datum. Beräkningarna är deterministiska och bygger på centraliserade källor där sådana finns:

- vikt: `getUnifiedWeightFacts`
- måltider: `filterActualMealsForDate`
- nutrition: `calculateDailyNutritionSummary`
- nutritionmål: `normalizeNutritionGoals` och `parseProteinGoal`
- check-in: `normalizeCheckInMetrics`

Ofullständig data ger neutral status i stället för tekniska värden.

## Streakregler

Streaks räknas bara för schemalagda dagar. Pausade dagar och oschemalagda dagar markeras neutralt och bryter inte med straffande text. Dagens ofullständiga status nollställer inte gårdagens streak innan dagen är slut.

V2 undviker formuleringar som skuldbelägger användaren. Neutral fallback är:

- `Redo att starta om i lugn takt`

## Veckofokus

Max tre aktiva fokus per vecka. Fokus kan komma från AI Nutrition Insights, men sparas bara efter användarens knapptryckning.

Ett fokus sparar:

- `id`
- `title`
- `reason`
- `linkedInsightId`
- `weekStart`
- `status`
- `createdAt`
- `acceptedAt`
- `archivedAt`

Ny vecka raderar inte gammal historik.

## AI Integration

`GoalsHabitsPanel` kan läsa lokala AI Nutrition Insights och visa knappen `Gör insikt till fokus`. Inget AI-svar persisteras automatiskt. Förslaget minimeras till titel, orsak och länkad insight.

AI Coach-svar och insight-regler ändras inte i V2.

## UI

Ny lazy-loaded vy:

- `src/components/GoalsHabitsPanel.jsx`

Panelen visar:

- veckofokus
- aktiva mål
- dagens vanor
- progress
- streak
- empty state
- skapa mål
- skapa vana
- pausa/återuppta/arkivera
- markera manuell vana klar

UI använder befintliga paneler, knappar och typografi. Statusuppdateringar använder `aria-live`, manuella vanor använder `aria-pressed`, och featurevyn laddas via `React.lazy`.

## Rapportintegration

V2 lägger den gemensamma progressmotorn på plats. Rapporter och dashboard kan konsumera `buildGoalsHabitsViewModel` utan att bygga egna mål- eller streakberäkningar. Detaljerade rapportkort för vanor är förberedda som V3-arbete.

## Reminder

ReminderSettings-kontraktet ändras inte. `reminderReference` finns i modellen som adapterfält, men V2 skapar inga reminders automatiskt och ingen web push läggs till.

## Säker Gamification

Tillåtet:

- milda positiva statusar
- neutral återstart
- databaserad feedback
- små veckofokus

Undviks:

- poänginflation
- topplistor
- skamtexter
- röda straffvarningar
- falsk brådska
- allt-eller-inget-logik

## Datum Och Tidszon

Progress och streaks använder lokala kalenderdatum via projektets befintliga datumhelpers. Motorn tar `analysisDate` för deterministiska tester och för att inte blanda faktisk systemdag med vald analysdag.

## Lazy Loading Och Prestanda

`GoalsHabitsPanel` lazy-loadas från `App.jsx`. Production build skapar en separat `GoalsHabitsPanel`-chunk. Den preloadas inte i `dist/index.html`; den hämtas först när appen renderar den inloggade featureytan.

Inga nya dependencies har lagts till.

## Säkerhet

Normalisering filtrerar bort felaktiga objekt, ogiltiga kategorier och extrema mål. Arkivering föredras framför radering. Den nya payloaden innehåller inga auth/sessionfält och lagras inte i gamla domännycklar.

## Teststrategi

Tester täcker:

- modellnormalisering
- versionering
- validering av extrema mål
- stabil objektsform för mål och vanor
- viktmål via central viktmodell
- automatiska vanor från verklig appdata
- planerade måltider räknas inte
- schemalagda dagar och neutral streak
- manuell vana kan bara markeras en gång per dag
- paus/återuppta/arkivera
- max tre veckofokus
- repository- och sync-nyckel
- server-rendering av UI utan tekniska värden

## Manuella Testfall

Rekommenderade manuella kontroller:

- starta appen utloggad
- logga in och kontrollera att panelen visas
- skapa proteinmål
- skapa automatisk vana
- skapa manuell vana
- markera manuell vana klar
- pausa och återuppta vana
- arkivera mål eller vana
- acceptera AI-insight som veckofokus
- kontrollera att max tre fokus är aktiva
- kontrollera att planerade måltider inte räknas som loggade
- kontrollera backup/restore och cross-tab efter ändring av mål eller vana
- kontrollera PWA-installation/offline efter build

## Kända Begränsningar

- Ingen full redigeringsvy per objekt ännu.
- Ingen separat arkivvy.
- Ingen persistent funktion för att dölja motivationskort.
- Reminder-koppling är modellförberedd men inte aktiv.
- Rapporternas UI visar ännu inte detaljerade habitkort.
- Veckofokus från AI kan accepteras men inte redigeras i ett separat steg.

## Framtida Goals & Habits V3

- Full redigering av mål och vanor.
- Reminder-adapter per vana.
- Rapportkort för streak och veckofokus.
- Arkivvy med enkel historik.
- Insight-till-mål-flöde med redigeringssteg.
- Dashboardkort som bara visar mest relevanta aktiva mål.
