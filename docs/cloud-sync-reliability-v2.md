# Cloud Sync Reliability V2

## Nuläge Före Sprinten

Viktkollen har Supabase Auth, manuell Cloud Backup/Restore och automatisk Cloud Sync V2. `localStorage` är fortfarande primär lokal datakälla. Cloud Sync använder `public.user_sync_items` separat från manuella `user_backups`, och Performance Architecture V2 laddar cloud/sync dynamiskt via `cloudRuntimeLoader`.

## Arkitektur

Viktiga moduler:

- `src/services/sync/cloudSyncEngine.js`: orchestration för automatisk sync.
- `src/services/sync/syncMetadata.js`: allowlist, deviceId, checksum, metadata och dirty tracking.
- `src/services/sync/syncQueue.js`: lokal persistent kö med dedupe och backoff.
- `src/services/sync/syncConflictResolver.js`: deterministisk konfliktklassificering och säkra merges.
- `src/services/sync/syncRestoreSafety.js`: snapshot, validering och rollback före inkommande molndata.
- `src/components/CloudSyncPanel.jsx`: användarflöde för autosync och konflikter.
- `src/components/CloudStatusPanel.jsx`: status för manuell molnbackup.

## Metadata

Metadata lagras separat från domändata:

- `viktkollen.syncMetadata`
- `viktkollen.syncQueue`
- `viktkollen.syncDeviceId`
- `viktkollen.syncRestoreSnapshots`

Domändata ändras inte och befintliga localStorage-format bevaras.

Metadata innehåller bland annat:

- version
- deviceId
- enabled
- keys per storageKey med checksum, updatedAt, deletedAt och lastRemoteRevision
- pendingKeys
- conflicts
- lastAttemptAt
- lastSuccessfulSyncAt
- lastError

## Enhets-ID

`syncDeviceId` är ett slumpmässigt anonymt ID, till exempel `device-...`. Det innehåller ingen hårdvaruinfo, e-post, authdata, tokens eller personuppgifter. Syftet är bara att kunna skilja klienter i syncmetadata.

## Dirty Tracking Och Kö

Allowlistade localStorage-nycklar jämförs med senast kända checksum. Ändrade nycklar markeras som pending och läggs i `syncQueue`. Kön deduplicerar per action/storageKey, överlever omladdning och har max 5 försök med exponentiell backoff.

## Synktriggers

Cloud Sync-panelen kör:

- manuell sync via knapp
- sync vid aktivering av autosync
- sync när appen kommer online om autosync är på
- initial autosync när panelen laddas och autosync är på

Endast en `runCloudSync` kör åt gången.

## Konfliktalgoritm

För varje allowlistad nyckel jämförs:

- lokal checksum
- remote checksum
- senast kända checksum/revision
- deleted/tombstone-status

Resultat:

- endast lokal ändring: upload
- endast molnändring: download
- samma revision/checksum: inget
- båda ändrade: merge om säkert, annars konflikt
- remote delete: appliceras endast om lokal data inte ändrats
- local delete: laddas upp som tombstone

Ingen silent overwrite sker vid osäker konflikt.

## Konflikt-UI

Cloud Sync-panelen visar konflikter med svenska val:

- Behåll lokal
- Använd moln

Vid molnval skapas snapshot före applicering. Misslyckad applicering rullar tillbaka till snapshot.

## Snapshot Och Rollback

Innan inkommande molndata skrivs:

1. storageKey valideras mot allowlist.
2. payloadstorlek kontrolleras.
3. aktuell lokal nyckel snapshotas.
4. remote record appliceras.
5. vid fel rullas snapshot tillbaka.

Snapshot-historiken begränsas till 5 poster.

## Retry Och Fel

Temporära fel klassificeras till svenska statustexter. Queue-items markeras failed/pending med backoff via `syncQueue`.

Klassificering täcker bland annat:

- offline/nätverk
- auth/session
- RLS/permission
- rate limit
- saknad tabell/schema
- okända molnfel

Permanenta valideringsfel skapar inte destruktiv retry.

## Statusmodell

`getCloudSyncStatusModel` är gemensam källa för:

- Synkad
- Osynkade ändringar
- Offline
- Väntar på återförsök
- Konflikt
- Synkfel
- Av

Panelerna ska inte bygga motstridiga statusar själva.

## Säkerhetsmodell

Cloud Sync synkar endast `syncStorageAllowlist`. Deny patterns stoppar auth, session, Supabase, token, secret och API-key. Syncmetadata, synckö, restore snapshots, backupmeta och auth/session är inte allowlistade.

Prototype pollution motverkas genom att osäkra nycklar ignoreras vid serialisering och merge.

## Supabase-schema Och RLS

Ingen ny SQL-migration krävdes i denna sprint. Befintlig `supabase/cloud_sync_v2.sql` innehåller `user_sync_items` med RLS, Force RLS, user_id-policyer och index per användare/storageKey.

Manuell backup/restore fortsätter använda `user_backups`.

## Test Mellan Två Enheter

1. Logga in i två webbläsare.
2. Aktivera autosync i båda.
3. Ändra en allowlistad datapunkt i webbläsare A.
4. Kör Synca nu eller gå online i webbläsare B.
5. Kontrollera att data laddas ned om B inte ändrat samma nyckel.
6. Ändra samma nyckel i båda före sync.
7. Kontrollera konflikt och välj lokal eller moln.

## Felsökning

- Kontrollera `viktkollen.syncMetadata`.
- Kontrollera `viktkollen.syncQueue`.
- Kontrollera att SQL-filen är körd och RLS-policyer finns.
- Kontrollera att användaren är inloggad.
- Kontrollera att appen är online.

## Kända Begränsningar

- Autosync triggas från Cloud Sync-panelens livscykel och online-händelser, inte från en global background worker.
- Konflikt-UI är per storageKey och visar inte full visuell diff.
- Queue/backoff är lokal och enkel, inte event-sourcing.

## Framtida Cloud Sync V3

- Global sync scheduler utanför panelen.
- Mer detaljerad diffvy för konflikter.
- Bättre observability för pending/retry.
- Sync-trigger efter varje relevant localStorage-skrivning med debounce.
