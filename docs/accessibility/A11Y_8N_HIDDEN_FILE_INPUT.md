# A11Y-8N — Dolt fokus på filväljare och Mer i regressionsgaten

Start: `d6b209e` (efter 8M). Gäller 8M-fynden A-N4, C-N1 och C-N2.

## Inventering av `input[type=file]`

| Komponent (plats i appen) | Mönster | Tabbbar? | Synlig? | Före 8N | Ägare |
|---|---|---|---|---|---|
| `DataImportCenter.jsx` (Mer → Import & Export) | Knappen "Välj fil" öppnar en `sr-only`-input | Före: ja. Efter: nej. | Nej | **A-N4** | Claude – **fixad** |
| `ProgressCenter.jsx` `ProgressImportExport` (Mer → Framsteg → Historik & verktyg) | "Importera JSON" + `sr-only`-input | Före: ja. Efter: nej. | Nej | **A-N4** (hittades i 8N) | Claude – **fixad** |
| `nutrition/NutritionImportExport.jsx` (Mer → Mat → Verktyg → Import, recension och mer) | "Välj säkerhetskopia" + `sr-only`-input | Före: ja. Efter: nej. | Nej | **A-N4** (hittades i 8N) | Claude – **fixad** |
| `CloudBackupPanel.jsx:615–622` (Mer → Säkerhet & Backup) | En knapp + `sr-only`-input (`aria-label` "Importera molnbackup från JSON-fil") | **Ja** | Nej | **A-N4** | **BLOCKED — CURSOR-OWNED** |
| `MealHistoryTools.jsx` (Mat → Mönster & historik → historik) | `<label class="secondary-button">` med en input som har `display: none` | **Nej**, inte heller etiketten | Etiketten syns | **Ny: A-N6.** "Importera mathistorik" går inte att nå med tangentbord (2.1.1). | Claude – inte ändrad (se nedan) |
| `BodyAnalysisTimeline.jsx` (Body Scan) | Samma mönster som MealHistoryTools | Nej | Etiketten syns | Samma som A-N6 | **CURSOR-OWNED** (Body Scan) |
| `BodyAnalysisUploader.jsx` (Body Scan) | Transparent input över etiketten | Ja | Ja (etiketten) | Inte granskad | **CURSOR-OWNED** (Body Scan) |
| `NutritionScannerV2.jsx` (Mat → Skanna mat), 2 st | Transparent input (opacity 0.001) över etiketten | Ja | Ja (etiketten) | Kräver manuell kontroll av fokusringen | Smart Camera-nära, **ej ändrad** |
| `ProgressPhotoUpload.jsx` (Framsteg → Framstegsbilder), 4 st | Synlig native input i etikettkort | Ja | Ja | OK i gaten | Claude |
| `PhotoAnalysis.jsx` (Mat, bara i dev-läge) | Input på 1 px med opacity 0.001 i `.photo-input` | Ja | Nej | Visas bara i dev (`import.meta.env.DEV`) | Claude – inte ändrad |
| `OverviewDashboard.jsx` (profilbild) | `sr-only` + `tabIndex=-1` + `aria-hidden` | Nej | Nej | Fixad i 8L | Claude |
| `SocialWatch.jsx` (Stället, bara admin) | Synlig native input i etikett | Ja | Ja | OK | Claude |
| `AiEarMode.jsx` (Smart Camera → AI Öra) | Synlig native input | Ja | Ja | Inte granskad | **CURSOR-OWNED** (Smart Camera) |

## Fixar i 8N

- **A-N4:** den dolda inputen får `tabIndex={-1}`. Den synliga knappen är enda
  Tab-stoppet och öppnar filväljaren som förut med Enter, Space och klick,
  exakt en gång. `accept`, `onChange`, importlogik och validering är
  oförändrade.
  - **Dataimport:** knappen beskrivs av hjälptexten (`aria-describedby`).
    Inputen behåller sitt `aria-label` men får inte `aria-hidden`: det
    befintliga testet `DataImportCenter.test.jsx` förbjuder strängen `true` i
    den renderade HTML-koden, och testet försvagas inte. Inputen går alltså
    fortfarande att nå i skärmläsarens läsläge, men inte med Tab (manuell
    kontroll, se nedan).
  - **Framsteg och Mat:** här används samma mönster som för profilbilden i 8L,
    `aria-hidden="true"` plus `tabIndex={-1}`.
- **A-N5 (nytt i 8N, hittades av gaten):** i datum- och tidsfält når Tab även
  webbläsarens egen kalender- eller klockknapp. Fältet är då fokuserat men
  inte `:focus-visible`, så ingen fokusring syntes (65+, Inkasso och
  Kronofogden). Nu ritar `styles/accessibility.css` fältets vanliga ring med
  `:focus-within:not(:focus-visible)`, även i högkontrastläget.

## Molnbackup — BLOCKED — CURSOR-OWNED

- **Fil:** `src/components/CloudBackupPanel.jsx`, raderna 615–622.
- **Element:** `<input ref={fileInputRef} aria-label="Importera molnbackup från JSON-fil" className="sr-only" type="file" accept="application/json,.json" onChange={handleImportFile} />`
- **Nuvarande beteende (reproducerat i Chromium):** Tab stannar på
  inputen. Fokus är osynligt eftersom inputen själv är `sr-only`, och ingen
  synlig kontroll visar fokus.
- **Rekommenderad minimal fix för Cursor:** lägg till `tabIndex={-1}`, och
  gärna även `aria-hidden="true"`, på inputen. Den synliga knappen som anropar
  `fileInputRef.current?.click()` är då den enda kontrollen. Ingen annan
  ändring behövs.
- **Gaten:** posten finns i baseline i `tests/a11y/more-folders.spec.js`
  (`knownFocusFindings`). Den faller om fyndet inte längre reproduceras, så
  posten ska tas bort i samma ändring som fixen.

## Nya regressionsgater

- **C-N2:** `tests/a11y/support/hiddenFocus.js` mäter varje Tab-stopp efter
  ett riktigt Tab-tryck. Ett stopp fälls om:
  - kontrollen själv är visuellt dold (`sr-only`, `visually-hidden`, clip,
    clip-path eller högst 1 px);
  - en förälder är visuellt dold;
  - kontrollen är genomskinlig, inte renderad eller ligger utanför skärmen;
  - kontrollen saknar fokusindikator (outline eller box-shadow).

  Bara stopp som tangentbordet faktiskt når mäts. Därför påverkas inte
  skärmläsartext, live regions, status eller en skip-link som blir synlig vid
  fokus, och det bevisas av fixture-testet i `hidden-file-input.spec.js`.
  Gaten körs i `focus-visibility.spec.js` (6 vyer × 4 lägen) och i
  `more-folders.spec.js`.
- **C-N1:** `tests/a11y/more-folders.spec.js` täcker alla 17 Mer-mappar med
  axe (critical och serious) och fokus. Täckningen jämförs med appens
  `moreHubFolders`. Baseline innehåller bara 8M-fynd (A-N2, A-N3, A-N4
  Molnbackup), och varje post har regel, mapp, 8M-fynd och planerad sprint.

## Kvar för senare sprintar

- **A-N6:** "Importera mathistorik" (`MealHistoryTools.jsx`) går inte att nå
  med tangentbord. Fixen är samma mönster som för Dataimport: en synlig
  knapp och en dold input. Beroende på hur panelerna i Mat fungerar bör den
  tas i 8P (Mat).
- **Manuellt:** VoiceOver och TalkBack på Dataimport ("Välj fil" med
  beskrivning; inputen i läsläge), och på den transparenta skannerinputen i
  Mat (syns fokusringen?).
