# Global Sync Scheduler V1

## Syfte

Global Sync Scheduler V1 flyttar automatisk Cloud Sync från `CloudSyncPanel` till ett centralt appomfattande schema. `localStorage` är fortsatt primär lokal datakälla, och manuell Cloud Backup/Restore är separat.

## Arkitektur

Nya delar:

- `src/services/sync/globalSyncScheduler.js`
- `src/services/sync/syncStatusStore.js`
- `src/services/sync/useGlobalSyncScheduler.js`
- `src/components/GlobalSyncStatus.jsx`

Schedulern är liten vid initial laddning och använder `cloudRuntimeLoader` för att lazy-loada `cloudSyncEngine` först när synk faktiskt ska köras.

## Lifecycle

`App.jsx` startar schedulern när en autentiserad användare finns och stoppar den vid utloggning eller användarbyte.

Vid stop:

- timers rensas
- event listeners tas bort
- gamla körningar invalidieras med token
- global status återställs

## Triggers

Global scheduler reagerar på:

- appstart när användaren är inloggad, online och fliken är synlig
- `online`
- `visibilitychange` till synlig flik
- allowlistade lokala lagringsändringar via `viktkollen:app-storage-changed`
- periodisk lågintensiv kontroll medan appen är synlig
- manuell sync via Cloud Sync-panelen

`CloudSyncPanel` startar inte längre automatisk online/appstart-sync själv.

## Dirty Tracking

`appStorageService` markerar redan allowlistade nycklar dirty via `markSyncKeyDirty`. V1 lägger till en payloadfri notification med enbart storageKey. Auth/session, PWA-cache, syncmetadata och tekniska nycklar filtreras bort av befintlig allowlist.

## Debounce Och Max Wait

Lokala ändringar debounce:as. Täta ändringar kompakteras via befintlig pendingKeys/queue-logik per storageKey. En max wait gör att kontinuerliga ändringar till slut leder till en sync.

Dirty metadata finns kvar i localStorage om appen stängs före sync.

## Single-flight

Automatisk och manuell sync går genom samma scheduler. Om en körning redan pågår ansluter nästa trigger till samma promise och markerar att en uppföljande körning behövs. När körningen är klar sker högst en ny planerad körning.

## Retry Och Backoff

Schedulern respekterar befintlig `nextAttemptAt` från `syncQueue` vid automatisk sync. Manuell sync kör med `force: true` och får kringgå retry-väntan.

## Status Store

`syncStatusStore` är en liten extern store utan tredjepartsbibliotek. Den exponeras via `useSyncExternalStore` i `GlobalSyncStatus`.

Statusmodellen innehåller:

- enabled
- online
- running
- dirty
- pendingCount
- retryAt
- lastSuccessfulSyncAt
- conflict
- error
- currentTrigger

Statusen innehåller aldrig payload eller tokens.

## Global UI

`GlobalSyncStatus` visas bara när något är relevant:

- Synkar...
- Ändringar väntar på synk
- Offline - synkar när anslutningen återkommer
- Synk pausad till nästa försök
- Konflikt kräver åtgärd
- Synkfel

Indikatorn länkar till befintligt `#cloud-sync`-flöde och använder `aria-live`.

## PWA

Schedulern kör inte sync när `navigator.onLine === false`. Offlineändringar finns kvar i metadata/kö och körs efter `online`. Service worker och PWA-filer ändras inte.

## Bundle

Cloud runtime är fortsatt lazy:

- `cloudSyncEngine` laddas först vid faktisk sync.
- `cloudSyncService` laddas av status/backupflöden.
- ingen `cloud-services` monolit återinförs.

## Test Mellan Två Webbläsare

1. Logga in i båda.
2. Aktivera autosync.
3. Ändra data i webbläsare A.
4. Vänta på debounce eller klicka Synca nu.
5. Kontrollera att webbläsare B laddar ned efter online/visibility eller manuell sync.
6. Gör samtidiga ändringar i samma storageKey.
7. Kontrollera att konflikt visas och inte skrivs över automatiskt.

## Felsökning

- Läs `viktkollen.syncMetadata`.
- Läs `viktkollen.syncQueue`.
- Kontrollera `pendingKeys`, `conflicts`, `nextAttemptAt` och `lastError`.
- Kontrollera att användaren är inloggad och online.
- Kontrollera att `supabase/cloud_sync_v2.sql` har körts.

## Kända Begränsningar

- Schedulern är per appsession/flik, inte en shared worker.
- Konflikt-UI är fortfarande per storageKey utan visuell diff.
- Repository-event täcker `appStorageService`; äldre direkta `localStorage.setItem` i avancerade nutritionmoduler markeras av deras befintliga sync scan när schedulern körs, men skickar inte alltid omedelbar event-notification.

## Framtida Sync Scheduler V2

- Flytta återstående direkta nutrition-storage-skrivningar till repository/adapters.
- Cross-tab coordination med BroadcastChannel.
- Mer detaljerad global status.
- Diffvy för konflikter.
