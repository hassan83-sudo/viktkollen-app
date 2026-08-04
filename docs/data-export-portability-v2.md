# Data Export & Portability V2

## Nulage

Viktkollen har redan Cloud Backup/Restore, Cloud Sync V3, Data Import & Migration V2 och sakra rapportexporter. Export V2 lagger en central, preview-first exportvag ovanpa samma repository- och backupmodell. Den skapar ingen ny auth, databas, syncmodell eller backupmodell.

## Arkitektur

- `src/services/export/exportSchema.js`: strukturell allowlist for exportbara sektioner.
- `src/services/export/dataExportEngine.js`: bygger exportutkast, backup-payload, verification och sammanfattning.
- `src/services/export/csvExport.js`: CSV for maltider, vikt och check-ins.
- `src/services/export/downloadService.js`: saker browser-download efter anvandarbekraftelse.
- `src/components/DataExportCenter.jsx`: lazy UI for preview, privacy summary och download.

## Stodda Format

- Full Viktkollen-backup JSON.
- Selektiv JSON med valda sektioner.
- CSV meals.
- CSV weight.
- CSV check-ins.
- Textsammanfattning.

## Allowlist

Exporten anvander sektioner som mappar till befintliga `userDataRepository`-nycklar och Cloud Sync V3:s allowlist. Okanda browsernycklar exporteras inte. Exporten itererar inte over hela localStorage.

Sektioner:

- profil och mal
- maltider och nutrition
- vikt
- check-ins
- goals/habits
- reminders och notiser
- Adaptive Coach
- planer, recept och inkopslistor
- framstegsmetadata utan bilder
- appinstallningar

## Integritet

Exporten inkluderar aldrig:

- inloggningssession
- losenord
- access tokens
- refresh tokens
- API-nycklar
- Supabase-session
- diagnostics
- service worker-cache
- raa bilder
- base64
- Blob URL
- raa AI-prompter
- raa providerresponser

Bildpolicy i V2: raw images exporteras inte. Minimal metadata far inga om den passerar sanitizer.

## Backupformat

Backupen ar kompatibel med befintligt `cloudBackupSchema` schema v2:

- `app`
- `appVersion`
- `exportedAt`
- `schemaVersion`
- `userData`
- `metadata`
- `checksum`
- `integrity`
- `selectedSections`
- `sectionVersions`

Checksums ar stabila och icke-kryptografiska. De ar avsedda for integritetskontroll, inte som sakerhetsgaranti.

## Verification

JSON- och CSV-utkast verifieras innan download med Data Import V2:

1. exportutkast byggs i minnet
2. payload serialiseras
3. importmotorn parsar samma text
4. importplan byggs utan write
5. warnings/errors visas i preview

Ingen faktisk import sker vid verifiering.

## CSV

CSV exporter:

- anvander UTF-8 BOM for Excel-kompatibilitet
- stoder semikolon som standard
- kan anvanda komma
- kan anvanda decimalpunkt eller decimalkomma
- citerar multiline-varden
- neutraliserar formula injection for text som borjar med `=`, `+`, `-` eller `@`
- undviker raw JSON i celler

## Download

Blob skapas forst nar anvandaren markerar bekraftelse och klickar download. Object URL revokas direkt efter klick. Filnamn saneras mot path traversal och osakra tecken. Ingen automatisk molnuppladdning eller exportko finns.

## User Isolation

Download kan kontrollera forvantat user-id mot aktuellt user-id. Om anvandaren andras mellan preview och download blockeras nedladdningen.

## Sessionshistorik

UI:t sparar endast sessionshistorik med format, tid, antal sektioner, antal poster, verification och approximativ storlek. Ingen payload, fil, e-post eller teknisk id-lista sparas.

## Launch Readiness

Development-panelen visar export engine health, backup schema, CSV serializer, import/export compatibility, auth/session exclusion, binary exclusion, last verification status, supported formats och maxstorlek. Inga anvandardata visas.

## Tester

Tester tacker allowlist, auth/session/token/image-exclusion, backup, selective export, deterministic payload, Data Import V2 verification, roundtrip-plan, CSV, formula injection, safe filename, download, user switch, oversized arrays och UI-kontrakt.

## Begransningar

- Full postniva-jamforelse mellan tva backupfiler ar dokumenterad som V3.
- Progressbilder exporteras inte som bildfiler i V2.
- Exporthistorik ar sessionsbaserad.
- Stora arrayer begransas i stallet for att streamas.
- Ingen remote preflight mot Cloud Sync kravs for lasande export.

## Future V3

- Validerad backupjamforelse pa postniva.
- Separat saker bildexport med anvandarval.
- Web Worker/streaming for mycket stora CSV-exporter.
- Mer detaljerade dependency-varningar per sektion.
