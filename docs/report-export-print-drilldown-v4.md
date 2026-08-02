# Report Export, Print & Drill-down V4

Reports V4 bygger vidare på Unified Reports UI V3. Vecko- och månadsrapporterna använder fortsatt Shared Analytics Engine som enda faktakälla, men får nu drill-down, säker text-export och tydligare utskriftsflöde.

## Nuläge

Före sprinten visade Weekly och Monthly:

- overview
- coverage
- trendkort
- comparison cards
- highlights
- attention items
- goals/habits
- next actions

Export fanns bara som enkel utskrift via webbläsaren. Drill-down saknades i rapporterna.

## Drill-down-arkitektur

Ny modell:

`src/services/reportDrilldownModel.js`

Den bygger en presentationsnära modell från `sharedReportUiModel`:

- `sectionId`
- `reportType`
- `period`
- `title`
- `summary`
- `coverage`
- `comparison`
- `trendCards`
- `highlights`
- `attentionItems`
- `evidence`
- `textualExplanation`
- `destination`
- `sourceStatus`

Sektioner:

- vikt
- nutrition
- aktivitet/check-in
- mål/vanor
- highlights/attention
- coverage/datakvalitet

Ingen ny analys görs i drill-down.

## Lazy Drill-down

Ny komponent:

`src/components/reports/ReportDrilldown.jsx`

Den lazy-loadas från Weekly och Monthly via `React.lazy`.

Tillgänglighet:

- `role="region"`
- fokus flyttas till rubriken
- Escape stänger
- tillbaka-knapp återför fokus till triggern
- `aria-expanded`
- `aria-controls`

## Printarkitektur

Rapporterna använder webbläsarens `window.print`.

Print-CSS döljer:

- navigation
- sekundära knappar
- interaktiva rapportactions

Rapportkort, drill-down och summarykort har `break-inside: avoid` för bättre läsordning.

Ingen PDF-dependency används.

## Text-export

Ny exportservice:

`src/services/reportExportService.js`

Den bygger UTF-8-text från en allowlistad rapportmodell:

- rapporttyp
- period
- sammanfattning
- coverage
- trender
- comparisons
- highlights
- attention items
- goals/habits
- next actions
- disclaimer

Filnamn:

- `viktkollen-veckorapport-YYYY-MM-DD.txt`
- `viktkollen-manadsrapport-YYYY-MM-DD.txt`

Exporten laddas dynamiskt vid användarklick. Den fungerar utan AI och utan nätverk när rapportdata finns lokalt.

## JSON-export

Ingen strukturerad JSON-export lades till i V4. Text-export räcker för användarens gransknings- och delningsflöde och minskar risken att rå domändata, authfält eller tekniska id:n följer med.

## Säkerhetsmodell

Exporten använder strukturerad allowlist och textsanering.

Den blockerar bland annat:

- token
- access_token
- refresh_token
- session
- authorization
- password
- email
- Supabase
- localStorage
- chat history
- base64
- diagnostics
- deviceId/tabId
- server payload

Fullständiga UUID-liknande id:n ersätts med `[id]`. Exportstorlek begränsas.

## Navigation

Drill-down-länkar går till befintliga ankare:

- `#vikt`
- `#nutrition-dashboard`
- `#checkin`
- `#mal-vanor`
- `#health-dashboard`

Ingen routerdependency lades till.

## AI-text

AI kan fortfarande formulera rapporttext via befintliga flöden, men V4-export och drill-down använder registrerade shared facts. AI-text får inte ersätta numeriska fakta.

## Offline och PWA

V4 ändrar inte service worker eller PWA-cache. Drill-down och text-export bygger på redan laddad lokal rapportdata. Exportblobbar cacheas inte.

## Empty States

Drill-down visar neutrala empty states när:

- trendserie saknas
- comparison saknas
- highlights saknas
- mål/vanor saknas
- datatäckning är låg

Saknad data blir inte noll och tolkas inte som misslyckande.

## Tester

Tester täcker:

- exporttext weekly/monthly
- filnamn
- MIME
- säkerhetsblockering
- id-sanering
- injicerbar downloadadapter
- drill-down-modell för alla sektioner
- drill-down-rendering
- inga auth/session/token/localStorage-läckor
- befintligt Unified Reports UI-kontrakt

## Kända Begränsningar

Printflödet är webbläsarbaserat och skapar ingen PDF automatiskt. Text-exporten är avsiktligt inte JSON och innehåller inte råa dataset eller bilder.

## Reports V5

Rimliga nästa steg:

- valbar export av en enskild drill-down-sektion
- dedikerad print preview-vy
- arkitekturtest som stoppar export av otillåtna fält
- fler destinationer när appen får mer formaliserad intern navigation
