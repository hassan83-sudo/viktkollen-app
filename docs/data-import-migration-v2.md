# Data Import & Migration V2

## Nulage

Viktkollen har lokal-first lagring via `userDataRepository` och `appStorageService`. Cloud Backup/Restore anvander befintligt backupformat, och Cloud Sync V3 anvander `syncStorageAllowlist`, dirty metadata och konfliktresolvern. Import V2 bygger ovanpa detta och skapar ingen ny auth, databas, syncmodell eller backupmodell.

Tidigare fanns flera lokala importvagar i enskilda komponenter. De kan fortfarande lasa aldre exportformat, men den nya centrala vagen ar `DataImportCenter`, dar filval alltid gar via preview, validering, importplan och explicit bekraftelse.

## Stodda Format

- Viktkollen backup schema v2.
- Viktkollen legacy snapshot v1.
- Aldre `viktkollen-nutrition` och `viktkollen-progress` JSON-exporter.
- CSV for vikt, maltider och check-ins.
- Okand JSON/CSV identifieras men importeras inte automatiskt.

ZIP stods inte i V2.

## Arkitektur

- `src/services/import/safeJsonParser.js`: defensiv JSON-parser med allowlistad sanering.
- `src/services/import/csvParser.js`: liten CSV-parser for komma, semikolon och tab.
- `src/services/import/importFormatDetector.js`: deterministisk formatdetektion.
- `src/services/import/importMigrations.js`: explicita adapters fran backup, legacy och CSV.
- `src/services/import/importValidators.js`: datatypsvalidering.
- `src/services/import/importPlanBuilder.js`: read-only importplan.
- `src/services/import/dataImportEngine.js`: preview och transactional apply.
- `src/components/DataImportCenter.jsx`: lazy UI for filval, preview, strategier och bekraftelse.

## File Validation

Importen accepterar endast `.json`, `.csv`, `.tsv` och `.txt` med rimlig MIME-typ. Tomma filer, binara filtyper och filer over 5 MB blockeras innan parse.

Ingen ra fil sparas permanent. Ingen base64 eller Blob URL anvands.

## JSON

JSON-parsern:

- tar bort UTF-8 BOM
- blockerar `__proto__`, `constructor` och `prototype`
- ignorerar auth/session/token/Supabase-liknande falt
- begransar djup, arraylangd och textlangd
- anvander aldrig `eval` eller dynamisk kod

Okand version ger inte automatisk import.

## CSV

CSV-parsern stoder:

- komma, semikolon och tab
- citattecken
- radbrytningar i citerade falt
- UTF-8 BOM
- decimalpunkt och decimalkomma
- svenska datum och ISO-datum
- dubblettrader
- skydd mot formula injection i previewtext

## Migration Rules

Migrationerna ar rena funktioner. Stabila id:n bevaras nar de finns. CSV-rader far deterministiska importerade id:n baserat pa importdatum och radnummer. Planerade maltider gors inte om till faktisk import via fuzzy logik; endast falt som kan mappas sakert tas med.

Okanda falt ignoreras. Ogiltiga poster markeras i importplanen och blockerar apply om de inte valjs bort i UI i en senare version.

## Preview Och Merge

Filval ger endast en `importSession`. Ingen persistence sker fore bekraftelse.

Strategier:

- `skip`: hoppa over datadelen
- `append`: lagg till nya objekt med stabila id:n
- `safeMerge`: ateranvander Cloud Sync V3:s mergepolicy dar det ar sakert
- `replace`: kraver extra bekraftelse i UI
- `manualReview`: blockerar apply tills anvandaren valjer en saker strategi

Ingen silent overwrite gors.

## Snapshot Och Rollback

`applyImportPlan` skapar snapshot for berorda allowlistade keys via `syncRestoreSafety` innan forsta skrivning. Om en skrivning misslyckas rullas alla berorda keys tillbaka. Rollback ar idempotent sa lange snapshoten ar giltig.

## Sync

Skrivning sker via befintlig localStorage-modell och markerar berorda keys dirty med `markSyncKeyDirty`. Global Sync Scheduler kan darefter reagera normalt. Importen skapar ingen ny syncmodell och laddar inte upp direkt till molnet.

## Backup/Restore

Aktuellt backupformat ateranvands. `userDataRepository` har utokats sa backupnycklarna tacker samma befintliga appdata som Cloud Sync V3 redan kanner till, exempelvis dietary preferences, templates, recipes, meal plans och shopping lists.

## User Isolation

Apply tar ett forvantat user-id och kontrollerar att aktuell user fortfarande matchar. Importsessionen ar endast in-memory och rensas nar anvandaren avbryter eller lamnar flodet.

## Error Handling

Feltexter ar svenska och neutrala. Ra payload, filinnehall, token, sessioner, e-post och stack traces loggas inte av importmotorn.

## Performance

`DataImportCenter` ar lazy-loaded fran `App.jsx`. Parser, migration och planeringsmoduler ligger i den lazy chunken och ska inte modulepreloadas i production. Initial bundle ska darfor bara paverkas av en liten lazy-deklaration.

## Tester

Tester tacker filvalidering, JSON-sakerhet, CSV-parsing, formatdetektion, legacy mapping, importplan, safe merge, replace-confirmation, snapshot, rollback, dirty metadata, user switch och UI:s preview-first-kontrakt.

## Manuella Testfall

- Importera liten aktuell Viktkollen-backup.
- Importera legacy backup v1.
- Importera CSV med vikt.
- Importera CSV med maltid.
- Importera CSV med check-in.
- Valj bort en sektion.
- Byt strategi till replace och bekrafta.
- Avbryt efter preview.
- Testa ogiltig fil.
- Testa dubblettrader.
- Testa offline preview.
- Testa import pa ny enhet och sync efterat.
- Testa logout eller user switch fore apply.

## Begransningar

- ZIP stods inte.
- Manuell per-rad exkludering ar inte komplett i V2.
- Importhistorik ar sessionsbaserad och sparar ingen persistent radata.
- Stora filer blockeras i stallet for att parsas i worker.
- Cloud conflict mot remote kors av befintlig sync efter lokal import, inte som separat remote preflight i V2.

## Future V3

- Web Worker for stora CSV-filer.
- Mer detaljerad manuell radgranskning.
- Remote preflight mot Cloud Sync V3 innan apply.
- Importhistorik med anonymiserad ring buffer om det behovs.
