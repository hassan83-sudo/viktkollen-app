# Cloud Sync V3

## Nuläge

Cloud Sync V3 bygger vidare på befintlig Cloud Sync V2, Global Sync Scheduler, Cross-tab Coordination, Sync Diagnostics, restore-safety och repositorymodellen. Ingen ny auth, ingen ny databas och ingen ny parallell syncmotor införs.

Primära befintliga delar:

- `cloudSyncEngine.js` orkestrerar key-level sync mot `user_sync_items`.
- `syncMetadata.js` äger allowlist, deviceId, checksum, pending keys och konflikter.
- `syncQueue.js` äger lokal queue med retry/backoff.
- `syncRestoreSafety.js` skapar snapshots och rollback före apply.
- `globalSyncScheduler.js` hanterar debounce, online-reconnect och single-flight.
- Cross-tab coordination ser till att leader äger scheduler.

## Konfliktarkitektur

Ny central motor: `src/services/sync/cloudConflictResolver.js`.

Beslut:

- `identical`
- `localWins`
- `remoteWins`
- `safeMerge`
- `manualConflict`
- `insufficientMetadata`
- `invalidPayload`

Resolvern jämför storageKey, checksum, version, updatedAt, deleted/tombstone, deviceId och payload. DeviceId används endast som metadata och avgör aldrig ensam vinnare.

## Merge Policies

Säkra merges används bara när datatypen har stabila objekt-id:n eller ett känt veckoupplägg:

- Meals, weights, check-ins, goals/habits, reminders, coach feedback, recipes och liknande: `mergeById`
- Weekly meal plans och shopping lists: `mergeWeeks`
- Profile, nutrition goals, dashboard period och andra total-state-nycklar: manuell konflikt vid samtidig ändring
- Chat och AI conversation memory: manuell konflikt

Automatisk merge blockeras när:

- samma objekt ändrats på båda sidor inom clock-skew-fönster
- deleted/active-status kolliderar
- payload saknar stabilt id
- schemaVersion är osäker
- payload innehåller osäkra prototype-nycklar

## Multi-device

Ny modul: `multiDeviceRegistry.js`.

Den bygger en härledd lista över kända enheter från befintlig metadata och remote rows. Den visar bara grova etiketter som Windows, iPhone, Android, Webbläsare eller Installerad PWA. Ingen IP, geodata eller full user agent visas.

DeviceId maskeras i diagnostics och UI.

## Sync History

Ny modul: `cloudSyncHistory.js`.

Historiken är sessionsbaserad och begränsad till 50 tekniska händelser. Den innehåller eventtyp, tid, datatyp, maskad deviceId, teknisk kod och säker sammanfattning. Den innehåller inte rå payload, tokens, session, e-post, hälsodata eller bilder.

## Recovery

Ny modul: `cloudRecoveryEngine.js`.

Recovery återanvänder befintliga sync restore snapshots. Före riskfylld mutation skapas snapshot. Vid apply-fel körs rollback och resultatet rapporteras som `recovered`, `blocked` eller `recoveryRequired`.

## Queue

Befintlig `syncQueue.js` används fortsatt. V3 förbättrar den med:

- FIFO-sortering
- collapse av oskickade update/delete/download för samma key
- tombstone bevaras som senaste state
- queue health och retry backlog

Ingen ny storage-nyckel införs.

## Delta Sync

V3 fortsätter med säker key-level sync via `user_sync_items`. Dirty keys används för att undvika full upload vid varje liten ändring. Object-level delta görs inte mot databasen ännu; säkra object merges sker lokalt vid konfliktbeslut.

## Offline Reconnect

Global scheduler fortsätter att pausa offline och återuppta när nätet kommer tillbaka. Queue respekterar retry/backoff och cross-tab leader äger synckörningen för att undvika syncstorm.

## Status och UI

Statusmodellen utökas med:

- `currentDevice`
- `activeDeviceCount`
- `staleDeviceCount`
- `pendingUploads`
- `pendingDownloads`
- `failedItems`
- `nextRetryAt`
- `recoveryStatus`
- `queueStatus`
- `syncHealth`

Cloud Sync-panelen visar V3-status och konflikter med lokal/remote tid, konfliktorsak och säker merge när det är verifierat möjligt.

Ny lazy development-vy: `SyncHealthDashboard.jsx`.

## Launch Readiness

Launch Readiness visar queue health, conflict count, recovery health, multi-device health, history size, retry backlog, last successful sync och offline reconnect-status. Device/user ids maskeras.

## Auth Isolation

V3 ändrar inte auth. Befintlig scheduler stoppar vid user switch/logout och resetar syncstatus. Queue/recovery ska aldrig appliceras över fel användare; manuell releaseacceptans ska fortfarande testa logout under upload/download/merge/recovery.

## Backup och Restore

Backupformatet ändras inte. Restore-säkerhet bygger fortsatt på snapshot/rollback. Efter restore ska dirty keys markeras av befintligt repositoryflöde och remote-konflikter lösas via V3-resolvern.

## Cross-tab

Cross-tab transport ska fortsatt bara skicka tekniska signaler, aldrig rå payload. Sync Health visar leader/follower via befintliga diagnostics.

## Security och Privacy

V3 skyddar mot:

- prototype pollution
- raw payload i diagnostics/history
- full device fingerprinting
- stale unsafe merge
- silent overwrite när båda sidor ändrats
- tombstone/active-kollision

Supabase Auth, RLS och `user_sync_items` används oförändrat.

## Performance

Cloud runtime är fortsatt lazy via `cloudRuntimeLoader`. Sync Health Dashboard är lazy och development-only. Inga nya dependencies har lagts till.

## Tester

Automatiska tester täcker konfliktbeslut, datatype policies, queue collapse/FIFO, retry status, history ring buffer, device masking/stale detection, recovery rollback och lazy-loading-kontrakt.

## Manuella Testfall

- Två riktiga enheter med samma konto.
- Lokal ändring på A, remote ändring på B.
- Safe merge för olika måltidsobjekt.
- Manual conflict för samma objekt.
- Välj lokal.
- Välj moln.
- Säker merge.
- Offline/online reconnect.
- Stale device.
- Restore på ny enhet.
- User switch medan sync väntar.
- PWA offline/update.

## Kända begränsningar

Device registry är härledd och sessionsnära, inte en serverpersistent device-tabell. Queue är fortfarande key-level. Full global conflict retention över flera serverless/browser-sessioner kan förbättras i Cloud Sync V4.
