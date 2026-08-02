# Sync Diagnostics & Browser Validation V1

## Nuläge

Viktkollen har nu:

- Global Sync Scheduler V1
- Cloud Sync Reliability V2
- Cross-tab Sync Coordination V1
- PWA V1/V2
- lazy cloud runtime via `cloudRuntimeLoader`

Före denna sprint gick det att se enkel syncstatus, men inte tillräckligt mycket tekniskt läge för tvåfliksfelsökning. Särskilt svåra frågor var:

- vilken flik är leader?
- används BroadcastChannel eller storage fallback?
- när gick senaste heartbeat?
- varför avvisades ett cross-tab-meddelande?
- laddades cloud runtime av misstag?
- vilken trigger startade senaste sync?

## Diagnosticsarkitektur

Ny diagnostics-store:

- `src/services/sync/syncDiagnostics.js`

Den innehåller:

- begränsad ring buffer för tekniska events
- maskning av identifierare
- anonymiserad diagnosticsrapport
- cloud runtime loaded-state
- rejected-message reason
- senaste syncresultat
- senaste felkategori

Store är processlokal och skriver inte permanent data.

## Event History

Ring buffer håller högst 100 event.

Event har:

- timestamp
- category
- message
- begränsad teknisk detail

Rå payload, tokens, sessioner, e-post, viktdata, måltider, nutritiondata, chatthistorik och bilder sparas inte.

## Masking

Identifierare kortas:

- `tab-abcdefghijklmnopqrstuvwxyz` blir `tab-ab...yz`
- user scope maskeras på samma sätt

Produktions-UI visar inte råa tabId:n.

## Diagnosticsrapport

Rapporten kan exporteras som anonymiserad JSON och innehåller:

- appversion
- browser capabilities
- transport
- role
- maskerade id:n
- scheduler state
- retry/conflict-state
- senaste tekniska events
- cloud runtime loaded-state
- PWA/service worker state

Rapporten får inte innehålla:

- e-post
- tokens
- session
- rå localStorage
- viktdata
- måltider
- nutritiondata
- chatthistorik
- bilder
- serverpayload

## Development Panel

Ny lazy panel:

- `src/components/SyncDiagnosticsPanel.jsx`

Panelen renderas endast när `import.meta.env.DEV` är true och laddas med `React.lazy`.

Panelen visar:

- leader/follower
- transport
- scheduler
- dirty/pending/retry/conflict
- cloud runtime
- online/visibility
- PWA/SW status
- senaste events

Säkra knappar:

- begär manuell sync
- simulera dirty-event
- kopiera anonymiserad rapport
- rensa diagnostics-historik

Knappar raderar inte domändata och kringgår inte konfliktskydd.

## Browsernära Testarkitektur

Projektet har Vitest men ingen Playwright-installation. För att undvika ny tung dependency i denna sprint används testbara adapters:

- mockad transportbus som representerar två flikar
- injicerade `windowRef`, `documentRef`, timers och storage
- fake timers för heartbeat, lease och manual sync timeout

Detta verifierar flera separata flikinstanser deterministiskt utan produktionsuppgifter.

## Validerade Flöden

Tester täcker:

- BroadcastChannel-liknande transport
- storage fallback
- okänd protokollversion
- okänd typ
- echo prevention
- fel user scope
- payload allowlist
- första leader
- follower när lease finns
- follower dirty-event till leader
- manuell sync från follower via leader
- takeover när leader saknas
- cleanup av listeners och scheduler
- diagnostics ring buffer
- masking
- anonymiserad rapport
- panelrendering utan råa id:n
- cloud runtime loaded-state

## Cloud Runtime

Diagnostics mäter när:

- `cloudSyncEngine` laddas
- `cloudSyncService` laddas

Det ändrar inte lazy-loading-kontraktet. Engine och service ligger kvar som separata chunks och modulepreloadas inte.

## PWA Och Livscykel

Diagnostics läser bara teknisk state:

- service worker status
- standalone/browser
- online/offline
- page visibility

Service worker används inte som sync-transport och ändras inte i denna sprint.

## Prestanda

Diagnostics-panelen är lazy. Diagnostics-store är liten och ligger i appskalet eftersom transport/coordinator behöver eventhooks. Builden visar en separat liten `SyncDiagnosticsPanel`-chunk.

## Manuell Test

Två flikar:

1. Starta dev server.
2. Logga in i två flikar.
3. Öppna Sync diagnostics.
4. Kontrollera att en flik är leader och den andra follower.
5. Klicka "Simulera dirty-event" i followern.
6. Kontrollera att leadern får dirty-trigger.
7. Klicka "Begär manuell sync" i followern.
8. Stäng leaderfliken.
9. Klicka "Begär manuell sync" i followern och kontrollera takeover.

Offline:

1. Sätt webbläsaren offline.
2. Gör lokal ändring.
3. Kontrollera dirty/pending status.
4. Gå online igen.
5. Kontrollera att leadern återupptar sync.

PWA-lik instans:

1. Öppna appen som installerad PWA och vanlig browserflik.
2. Logga in med samma användare.
3. Kontrollera leader/follower i diagnostics.
4. Stäng leadern och verifiera takeover.

## Kända Begränsningar

- Inga riktiga Playwright-tester infördes; browsernära flöden täcks med deterministic adapters.
- Diagnostics är processlokal och överlever inte reload.
- Leader election är fortsatt browser best-effort, inte ett serverlås.
- Panelen är development-only och ska inte användas som användarfunktion.

## Framtida Diagnostics V2

- Lägg till Playwright om projektet vill ha riktiga multi-page browserkörningar.
- Visa mer detaljerad leader lease-tidslinje.
- Lägg till optional navigator.locks-diagnostics.
- Exportera diagnostics som nedladdningsbar fil i dev.
- Lägg till automatiserade PWA controllerchange-scenarier.
