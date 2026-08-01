# Cross-tab Sync Coordination V1

## Nuläge Före Sprinten

Global Sync Scheduler V1 flyttade automatisk sync från `CloudSyncPanel` till appskalet. Det gjorde sync global inom en flik, men varje öppen flik eller PWA-fönster kunde fortfarande starta en egen scheduler. Risken var dubbla autosync-försök, parallella retries och onödiga cloud runtime-laddningar.

`localStorage` är fortsatt primär lokal datakälla. Domändataformat, Supabase Auth, manuell backup/restore, PWA och offline-appskal ändras inte.

## Arkitektur

Nya delar:

- `src/services/sync/crossTabSyncTransport.js`
- `src/services/sync/crossTabSyncCoordinator.js`
- `src/services/sync/crossTabSyncCoordinator.test.js`

`useGlobalSyncScheduler` startar nu `globalSyncCoordinator`. Coordinatorn startar den befintliga `globalSyncScheduler` endast när fliken är leader.

## Transport

Primär transport är `BroadcastChannel` via kanalen `viktkollen.sync.crossTab.v1`.

Fallback är `storage`-event via den tekniska nyckeln:

- `viktkollen.sync.crossTab.signal.v1`

Fallback-signalen skrivs och tas bort direkt. Den innehåller bara teknisk metadata och ändrar inte domändata.

## Meddelandeschema

Alla meddelanden har:

- `protocolVersion`
- `type`
- `tabId`
- `userScope`
- `sentAt`
- `payload`

Tillåtna typer:

- `TAB_HELLO`
- `TAB_GOODBYE`
- `HEARTBEAT`
- `LEADER_CLAIM`
- `LEADER_RELEASE`
- `LOCAL_DATA_DIRTY`
- `SYNC_REQUEST`
- `SYNC_STARTED`
- `SYNC_COMPLETED`
- `SYNC_FAILED`
- `CONFLICT_DETECTED`
- `STATUS_SNAPSHOT`
- `AUTH_CHANGED`

Payload allowlistas defensivt. Rå användardata, tokens, sessioner, chatthistorik, viktdata och nutritiondata skickas aldrig.

## TabId

`tabId` är anonymt, skapas per flik/fönster och lagras inte permanent. Det är inte samma sak som syncens `deviceId`.

## Leader Election

Leadern äger automatisk sync. Followers kan markera dirty, ta emot status och begära manuell sync.

Leader state lagras i en teknisk lease:

- `viktkollen.sync.crossTab.leader.v1`

Lease innehåller:

- protokollversion
- anonymt `tabId`
- `userScope`
- `claimedAt`
- `expiresAt`
- om fliken var synlig

Tie-break:

- saknad eller utgången lease kan tas över
- synlig flik prioriteras framför bakgrundsflik
- vid lika synlighet vinner lägst `tabId`

Leadern förnyar lease via heartbeat. Logout, användarbyte, pagehide och beforeunload släpper lease best-effort. Om en flik kraschar går lease ut och en follower kan ta över.

## Scheduler-Integration

Endast leader startar:

- autosync
- periodisk kontroll
- retry-körningar
- debounce/max wait från `globalSyncScheduler`

Followers lyssnar på lokala repository-events och skickar `LOCAL_DATA_DIRTY` till leadern. Leadern debounce-planerar sync via befintlig scheduler.

Manuell sync från follower skickar `SYNC_REQUEST`. Om leadern svarar kör leadern sync. Om leader saknas eller timeout uppstår omvärderar followern ledarskapet och kan ta över.

## Dirty-Signaler

`appStorageService` skickar `viktkollen:app-storage-changed` efter allowlistade writes/removes. Coordinatorn skickar bara storageKey som teknisk metadata mellan flikar. Själva datan läses alltid lokalt av syncmotorn från befintliga localStorage-nycklar.

## Statusmodell

`syncStatusStore` innehåller nu `syncCoordination`:

- `role`
- `hasLeader`
- `leaderLastSeenAt`
- `activeTabCount`
- `transportType`
- `schedulerActive`
- `latestTrigger`

Produktions-UI visar inte råa tabId:n. Tekniska detaljer är avsedda för diagnostics och tester.

## Säkerhet

Transporten validerar:

- protokollversion
- känd meddelandetyp
- tabId-format
- userScope
- timestamp
- maxstorlek
- echo-loopar
- payload allowlist

Okända fält ignoreras. Meddelanden med fel scope, okänd typ, fel version, gammal timestamp eller framtida timestamp avvisas.

## PWA Och Livscykel

Service worker används inte som transport. Offline-appskal, manifest, ikoner och update flow ändras inte.

Coordinatorn hanterar:

- flera vanliga flikar
- PWA-fönster plus webbläsarflik
- visibilitychange
- pagehide/beforeunload best-effort
- återkomst efter att lease gått ut
- online/offline via befintlig scheduler

## Bundlepåverkan

Coordination-lagret är litet och importerar inte cloud engine eller Supabase-klient. `cloudSyncEngine` och `cloudSyncService` laddas fortsatt dynamiskt först vid faktisk sync eller status/backupflöde.

## Test Med Två Flikar

1. Logga in i två flikar.
2. Aktivera autosync.
3. Ändra data i follower-fliken.
4. Kontrollera att global status visar väntande/synk.
5. Kontrollera att endast leader kör sync.
6. Klicka manuell sync i follower-fliken.
7. Stäng leader-fliken.
8. Gör en ny ändring och kontrollera att followern tar över.

## Test Med Installerad PWA

1. Öppna appen både installerad och i webbläsaren.
2. Logga in med samma användare.
3. Gör en lokal ändring i ena fönstret.
4. Kontrollera att andra fönstret inte kör parallell autosync.
5. Stäng leader-fönstret och verifiera takeover.

## Felsökning

Kontrollera:

- `viktkollen.sync.crossTab.leader.v1`
- `viktkollen.syncMetadata`
- `viktkollen.syncQueue`
- global status `syncCoordination`
- om fliken är online och synlig
- om konflikt blockerar autosync

## Kända Begränsningar

- Leader election är browser-baserad best-effort, inte ett distribuerat serverlås.
- `BroadcastChannel` saknas i vissa miljöer; storage fallback används då.
- `pagehide` och `beforeunload` är best-effort och garanteras inte av alla webbläsare.
- Ingen service worker background sync införs i V1.

## Framtida Cross-tab Coordination V2

- Development diagnostics-panel för syncCoordination.
- Frivillig `navigator.locks`-optimering ovanpå lease.
- Mer detaljerad statusreplikering från leader till followers.
- Cross-tab throttling för mycket täta dirty-signaler.
