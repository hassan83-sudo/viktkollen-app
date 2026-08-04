# Notifications V3

## Nuläge före V3

Notifications V3 bygger ovanpå befintliga delar:

- Reminder Engine V2: `reminderModel`, `reminderScheduler`, `reminderActions`, `reminderNotifications` och `reminderRepository`.
- Lagring: `viktkollen.reminders.v2`.
- Cloud Sync V3: `viktkollen.reminders.v2` finns redan i sync allowlist och backupnycklar.
- Adaptive Coach V7: feedback, actions, timeline, patterns och weekly plan används som signaler.
- Goals/Habits V3: kopplade reminders ligger redan i mål-/vane-state och reminder-state.
- Scheduler: appskalet använder `createReminderScheduler` och cross-tab scheduler lock.
- Notification permission: begärs via befintliga användarstyrda knappar.
- Launch Readiness: visar PWA, reminders och syncstatus.
- Diagnostics: Cloud Sync V3 maskerar tekniska id:n och rå payload.

Det fanns ingen central notificationsmotor som kunde väga samman reminders, coach actions, weekly plan och syncsignaler. Legacy reminder-settings har ett gammalt intervall i `App.jsx`, men det aktiveras inte och V3 använder inte den vägen.

## Arkitektur

Ny central modul:

`src/services/notifications/notificationEngine.js`

Motorn är deterministisk och regelbaserad. Den skapar ingen ny auth, ingen ny databas, ingen ny service worker, ingen ny backupmodell och ingen extern AI-analys.

## Lagring och sync

Notifications V3 sparas bakåtkompatibelt i befintlig reminder-state:

`viktkollen.reminders.v2.notificationsV3`

Struktur:

- `version`
- `settings`
- `settings.quietHours`
- `history`
- `lastDeliveredAtBySource`

Eftersom allt ligger under `viktkollen.reminders.v2` följer det befintlig Cloud Sync V3, backup/restore och repositorymodell.

## Smart Scheduling

Motorn analyserar:

- due reminders från Reminder Engine V2
- adaptive coach feedback
- weekly plan actions
- synckonflikter och sync health
- historiska completed, skipped, snoozed, dismissed och postponed-events

Den prioriterar synckonflikter högst, därefter relevanta reminders och coach actions.

## Quiet Hours

Standard:

- start: `22:00`
- slut: `07:00`

Under quiet hours skickas inga browsernotiser. Kommande notiser skjuts fram till quiet-hours-slutet.

## Batching

Notiser inom ett dynamiskt batchfönster slås ihop. Standard är 30 minuter. Om användaren ofta skjuter upp eller hoppar över notiser ökas fönstret, så appen stör mindre.

## Adaptive Delivery

Motorn använder endast observerad lokal historik:

- många completed: mer responsiv rytm
- många skipped/snoozed/postponed: reducerad rytm och längre batchfönster

Ingen personlighetsprofilering görs och inga data skickas externt.

## Cross-device

Dubbelnotiser minskas genom:

- befintlig scheduler leader-lock
- syncad `lastDeliveredAtBySource`
- maskade source-id:n i historik
- cooldown för samma källa

Detta är inte serverpush. Browsernotiser fungerar bara när appen och browsermiljön tillåter det.

## UI

Ny lazy panel:

`src/components/NotificationCenter.jsx`

Visar:

- kommande notiser
- historik
- completed
- postponed
- dismissed
- permission
- quiet hours
- adaptive cadence

Panelen är lazy-loaded och ska inte modulepreloadas i production.

## Launch Readiness

Readiness rapporterar:

- permission
- scheduler
- quiet hours
- sync health
- pending notifications
- batching window

## Säkerhet och privacy

Historiken sparar inte rå payload, authdata, tokens, bilder eller fullständiga source-id:n. Källor maskeras med lokal hash.

## Kända begränsningar

- Ingen serverpush.
- Ingen background sync för notiser.
- Browsernotiser fungerar inte garanterat om appen är helt stängd.
- Cross-device dubbelnotiser reduceras men kan inte elimineras perfekt utan serverbaserad notification delivery.
