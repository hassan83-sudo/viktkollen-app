# Production Hardening V1

## Nulägeskartläggning

Granskade centrala ytor:

- `App.jsx`, `main.jsx` och `AppErrorBoundary`
- `authService`, `supabaseClient`
- `userDataRepository`, `appStorageService`
- Cloud sync, global scheduler, cross-tab coordination och diagnostics
- PWA registration och lifecycle
- AI controller och fallbackflöden
- Shared analytics, reports, dashboard och export
- Goals/Habits och Reminder Engine V2
- Vitest/Vite-konfiguration och package scripts

Appen hade redan root boundary och flera feature-boundaries. De största kvarvarande riskerna var inkonsekvent felklassificering, direkt console-loggning i cloud sync, direkt storage i en komponent samt sporadiska timeoutar i två stress-tester.

## Åtgärdade risker

- `appErrorService` returnerar nu ett stabilt kontrakt: `safeCategory`, `safeUserMessage`, `retryable`, `severity`, `technicalCode`, `shouldReport`, `shouldLogout` och `shouldRetry`.
- Error boundary visar säkert fel-id och dev-detalj endast i development.
- `safeLogger` maskerar token, session, e-post, lösenord, base64/bilder, payload och raw storage.
- Cloud sync använder säker logger för sync-eventfel.
- Progress Dashboard använder `appStorageService` för periodpreferens med samma lagringsnyckel.
- Launch readiness är lazy-loaded och endast development.
- Långsamma nutritionstressfall behåller 5000 måltider men har lokal testtimeout.

## Storage

Ingen befintlig domännyckel ändrades. Korrupt JSON i `appStorageService` ger fallback och raderar inte data. Tekniska nycklar hålls separerade där de inte ska syncas eller backupas.

## Auth och Sync

Auth-kontraktet ändrades inte. Sync-kontraktet ändrades inte, förutom att loggning av lokala sync-eventfel går via säker logger. Cloud runtime förblir lazy.

## Reminders

Reminder Engine V2 kvarstår med lazy `ReminderCenter`, lokal scheduler och tekniskt scheduler-lock. Notifications innehåller inte känslig data och permission begärs endast via användarhandling.

## PWA

PWA-kontraktet ändrades inte. Build verifierar att manifest, service worker och ikoner följer med i `dist`.

## Performance guardrails

Rimliga varningsbudgetar för fortsatt granskning:

- `index`: bör granskas om den passerar 200 kB minifierat.
- `react-vendor`: förväntas vara runt 190 kB.
- `supabase-vendor`: förväntas vara runt 206 kB.
- `ReminderCenter`: ska vara lazy och under 10 kB.
- Development-only panels ska inte modulepreloadas i production.

`dist/index.html` ska inte modulepreloada stora featurevyer som Reminder Center, report drilldown eller cloud backup.

## Teststabilitet

De tidigare sporadiska testerna är:

- `src/services/nutrition/nutritionConfidence.test.jsx`
- `src/services/nutrition/nutritionRecommendations.test.jsx`

Stressfallen kör fortfarande 5000 måltider. Lokal timeout används för just dessa testfall för att undvika miljöflakiness utan att höja global timeout.

## Säkerhetsgranskning

Sökningar gjordes efter:

- `console.*`
- `localStorage.setItem`
- `dangerouslySetInnerHTML`
- `createObjectURL`/`revokeObjectURL`
- `JSON.parse`
- notification content
- export/import paths

Kvarvarande direkta `JSON.parse` förekommer främst i importflöden och tests; de fångas av befintliga try/catch- och valideringslager eller är testkod. Object URLs som hittades revokas efter användning.

## Kvarvarande manuella kontroller

- Appstart utloggad.
- Login/logout och användarbyte mellan flikar.
- Offline och återanslutning.
- Sync conflict och takeover.
- PWA install/update/offline i Chrome och Edge.
- Reminder due/snooze/skip/complete i två flikar.
- Report export/print i browser.
- Development readiness-panel syns endast i development.
