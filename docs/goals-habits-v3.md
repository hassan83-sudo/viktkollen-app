# Goals & Habits V3

## V2-nuläge

V2 gav Viktkollen en versionerad mål- och vanemotor med nyckeln `viktkollen.goalsHabits.v2`, lazy-loaded panel, repositorylagring, sync allowlist, backup/restore och AI-insight till veckofokus. V3 bygger vidare på samma state och behåller `schemaVersion: 2` eftersom ingen brytande datamigration krävs.

## Modellutökningar

Äldre V2-data fortsätter fungera. Nya valfria fält normaliseras när de finns:

- `history`: begränsad eventhistorik
- `reminders`: kopplade frivilliga mål-/vanepåminnelser
- `goal.needsReview`
- `habit.reminder`
- `habit.needsReview`
- `weeklyFocus.action`
- `weeklyFocus.completedAt`
- `weeklyFocus.declinedAt`
- `weeklyFocus.linkedItemId`
- `weeklyFocus.linkedItemType`
- `weeklyFocus.movedFromWeekStart`
- `weeklyFocus.order`

Historikgränsen är 160 events. Historiken sparar bara små events, inte fulla kopior av mål, vanor eller authdata.

## Redigering

`updateGoal` och `updateHabit` bevarar:

- `id`
- `createdAt`
- tidigare completions
- historik

`updatedAt` sätts vid ändring. Ändrad frekvens skriver inte om gamla completions eller tidigare streakunderlag.

Validering avvisar extrema eller straffande mål och vanor med neutral svensk text.

## Arkiv

Arkivering sker via `updateGoalsHabitsItemStatus`. Arkiverade objekt räknas inte som aktiva. `restoreGoalsHabitsItem` återställer utan att skapa dubbletter. Permanent radering finns som separat servicefunktion och fungerar endast för redan arkiverade objekt.

Standardflödet i UI:t är arkivering, inte radering.

## Historik

Följande händelser loggas:

- redigerad
- pausad
- återupptagen
- slutförd
- arkiverad
- återställd
- manuell markering
- undo
- reminder ändrad
- veckofokus accepterat, redigerat, klart, flyttat eller arkiverat

Gamla objekt utan historik normaliseras utan fel.

## Reminders

V3 lägger till en liten adapter i goals/habits-state. Den skapar inga web push-notiser och ändrar inte `ReminderSettings`-kontraktet.

En reminder innehåller:

- `id`
- `linkedType`
- `linkedId`
- `enabled`
- `paused`
- `time`
- `days`

Pausad eller arkiverad vana pausar kopplad reminder. Återställning aktiverar inte reminder automatiskt.

## Dagens Vanor

Panelen visar:

- schemalagda idag
- automatiskt genomförda
- manuellt genomförda
- väntande
- pausade
- dagsprogress

Manuell markering är idempotent per datum och kan ångras samma dag med `undoManualHabitDone`.

## Streak V3

Streaks räknas fortfarande från samma deterministiska motor. Pausade och oschemalagda dagar hanteras neutralt. Dagens ofullständiga vana straffar inte användaren. Frekvensändringar loggas som historik men skriver inte om äldre completions.

## Veckofokus

Veckofokus kan:

- skapas från AI Nutrition Insights efter bekräftelse
- redigeras före lagring
- markeras klart
- arkiveras/avstås
- flyttas till nästa vecka
- ordnas via `order`

Max tre aktiva fokus per vecka gäller fortsatt.

## Rapportintegration

`buildGoalsHabitsReportSummary` återanvänder samma motor som panelen. Veckorapport och månadsrapport lägger till ett mål-/vanefält när state finns. Äldre användare utan `goalsHabits` får samma rapportbeteende som tidigare.

AI får inte ändra fakta; rapportfaktan byggs lokalt.

## Dashboard

`buildGoalsHabitsDashboardSummary` är en lätt selector som kan användas utan att ladda `GoalsHabitsPanel`. Smart dashboard visar en liten activity/summary när relevant goals/habits-data finns.

## AI Insightflöde

AI Nutrition Insights kan öppna ett förifyllt veckofokusutkast. Användaren kan redigera titel och handling före persistens. Ingen insight skapar mål, vana eller fokus automatiskt.

## Säkerhetsregler

V3 blockerar eller flaggar:

- extrema viktmål
- extrema proteinmål
- extrema stegmål
- straffande eller skuldbeläggande text
- träningsvana utan vilodag vid mycket hög frekvens
- för många aktiva mål

Äldre objekt raderas inte automatiskt. De kan normaliseras med `needsReview`.

## Repository, Sync Och Backup

All permanent state går via `userDataRepository` och nyckeln `viktkollen.goalsHabits.v2`. Sync allowlist, backup/restore och cross-tab dirty events återanvänder befintlig infrastruktur. Ingen SQL-migration behövs.

## Datum Och Tidszon

Beräkningar använder `analysisDate` och befintliga `localDate`-helpers. Tester använder fasta datum.

## Lazy Loading

Featureytan är fortsatt lazy-loaded via `React.lazy`. Dashboard och rapporter använder selectors och laddar inte panelkomponenten.

## Teststrategi

Tester täcker:

- V2-normalisering
- mål- och vaneredigering
- bevarat id/createdAt
- updatedAt
- säkerhetsvalidering
- manuell markering och undo
- arkiv/restore/permanent delete
- reminderadapter
- statuslivscykel
- veckofokus edit/complete/move
- rapport- och dashboardselectors
- UI-rendering utan tekniska värden

## Manuella Testfall

Kontrollera:

- appstart utloggad
- äldre V2-state
- skapa och redigera mål
- skapa och redigera vana
- manuell vana och undo
- automatisk vana
- paus/återuppta
- arkiv/återställ
- påminnelse på vana
- veckofokus från AI-insight
- veckofokus klart/flytta/avstå
- vecko- och månadsrapport
- dashboardsummary
- backup/restore
- sync/cross-tab
- PWA/offline

## Kända Begränsningar

- Reminderadaptern sparar koppling och lifecycle, men ingen ny web push-motor byggs i V3.
- Permanent delete finns bara för arkiverade objekt.
- Fokusordning stöds i modellen men UI:t har enkla actionknappar, inte drag and drop.
- Rapportintegration visar sammanfattning, inte full historikgraf.

## Framtida Goals & Habits V4

- Full separat edit-dialog med osparade ändringar-varning vid navigation.
- ReminderSettings kan visa och öppna kopplade mål/vanor.
- Drag and drop för veckofokus.
- Mer detaljerade rapportkort för historik och streaks.
- Dedikerad arkiv- och historikvy.
