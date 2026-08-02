# Reminder Engine V2

## Nuläge

Reminder V2 samlar nya frivilliga påminnelser i en egen versionerad modell. Den gamla panelen `ReminderSettings` och nycklarna `viktkollen.reminders`/`viktkollen.reminderLog` finns kvar för bakåtkompatibilitet, men den gamla 30-sekundersnotifieringen i appen är avstängd till förmån för V2-scheduler och in-app-påminnelser.

## Modell och lagring

Nyckel: `viktkollen.reminders.v2`

Payload:

- `schemaVersion: 2`
- `reminders`: max 100 normaliserade reminders
- `history`: max 100 tekniska historikhändelser
- `smartCategories`: frivilliga smarta kategorier
- `updatedAt`

En reminder innehåller bland annat `id`, `type`, `title`, `description`, `linkedEntityType`, `linkedEntityId`, `scheduleType`, `time`, `daysOfWeek`, `intervalMinutes`, `startDate`, `endDate`, `timezone`, `enabled`, `snoozedUntil`, `pausedAt`, `archivedAt`, `createdAt`, `updatedAt`, `lastTriggeredAt`, `lastCompletedAt`, `source` och `safetyCategory`.

All läsning och skrivning går via `reminderRepository`, som använder `userDataRepository`.

## Sync och backup

`viktkollen.reminders.v2` ligger i sync allowlist och backupnycklar så påminnelser kan följa användaren. Tekniskt fliklås `viktkollen.reminders.v2.schedulerLock` syncas eller backupas inte.

Ingen auth, session, token eller Supabase-data sparas i reminderpayloaden.

## Scheduler

`reminderScheduler` är lokal, deterministisk och offlinekompatibel. Den använder en single-timer-modell, räknar nästa trigger från reminderdata och reagerar på `visibilitychange`, `online` och `focus`. Förfallna reminders markeras med `lastTriggeredAt` för att undvika upprepning samma dag.

Tider tolkas som lokal användartid. V2 lovar inte browsernotiser när appen är helt stängd.

## In-app och notifications

In-app-bannern fungerar utan Notification API. Den visar titel, neutral beskrivning och handlingarna:

- Klar
- Snooza
- Hoppa över
- Öppna Reminder Center

Browsernotiser kräver användarinitierad permission. Notification body innehåller bara neutral text: ingen känslig hälsodata eller domändata.

## Goals & Habits

Goals & Habits V3 har redan `reminder` och `reminders` i modellen. Reminder V2 läser detta som kopplad status i Reminder Center men skapar inte reminders automatiskt. Paus/arkiv i Goals & Habits fortsätter hanteras i goals/habits-modellen.

## Smarta triggers

`buildSmartReminderSuggestions` skapar bara förslag, aldrig reminders. Varje kategori måste aktiveras av användaren. Stöd finns för check-in, vikt, måltidsloggning, vana, veckorapport och månadsrapport.

Planerade måltider räknas inte som faktiskt intag.

## Säkerhet

Modellen markerar aggressiva, skuldbeläggande eller medicinskt olämpliga formuleringar med `needsReview` och byter till neutral fallbacktext. Intervall under 60 minuter accepteras inte för interval-reminders.

## Prestanda

Reminder Center är lazy-loaded i `App.jsx`. Scheduler, modell och banner är små och laddas i appskalet. Inga nya dependencies har lagts till.

## Manuella tester

1. Starta appen och kontrollera att ingen reminder skapas automatiskt.
2. Skapa en egen reminder i Reminder Center.
3. Sätt tiden så att den förfaller och verifiera in-app-banner.
4. Testa Klar, Snooza och Hoppa över.
5. Arkivera och återställ en reminder.
6. Klicka på browsernotisknappen och verifiera granted/denied/default.
7. Öppna två flikar och kontrollera att bara en flik normalt håller scheduler-låset.
8. Testa offline/PWA: appen ska fortfarande visa in-app-påminnelser när den körs.

## Begränsningar

- Ingen web push.
- Ingen service worker background sync.
- Inga notislöften när appen är helt stängd.
- Smart triggers är förslag i V2; full kategori-UI kan byggas i V3.
- Cross-tab-koordinering använder ett kort tekniskt lokalt lås, inte cloud-scheduler.

## Reminder Engine V3

Möjliga nästa steg:

- Mer synligt smart trigger-UI.
- Bättre integration med Goals & Habits-livscykeln direkt från Reminder Center.
- Server push eller Web Push om appen senare får ett säkert serverflöde.
- Mer detaljerad diagnostics-panel för scheduler-takeover.
