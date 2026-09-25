# A11Y-8T — Djup gap-audit efter 8N–8S

Granskningen är read-only. Ingen produktionskod, inga tester och ingen CSS har
ändrats. De tillfälliga sonderna (`tests/a11y/_audit8t_*`) är borttagna före
commit.

- **Underlag:** `claude/parallel-1` på `c7ba1df`.
- **`origin/main`:** har flyttats till `39c2f7a` ("billing: add safe PostgREST
  exposure probe", Cursor). Det är bara noterat, inget är mergat.

Metod:
- Chromium (Playwright) i alla 6 huvudvyer och alla 17 Mer-mappar.
- Axe med AA och best-practice, samt experimentella regler separat.
- Chromes tillgänglighetsträd via CDP.
- Den generella gaten för dolt fokus från 8N.
- Träffytor för alla kontroller, med kontroll av avståndsundantaget.
- Reflow i fyra lägen med Range-baserad klippdetektering från 8R.
- Forced colors-signaturer från 8S.
- Reduced motion.
- Kodsökning efter native-dialoger och språk.

## 1. Sammanfattning

- **Alla A-fynd från 8M är lösta** (A-N1–A-N4), med ett undantag: Molnbackups
  del av A-N4 är fortfarande **BLOCKED — CURSOR-OWNED**.
- **8M-fynd med ny status:**
  - B1, B5, B6, B7, B8, B9, B11, B-N1, B-N2 och B-N3 är **FIXED**;
  - B12 är fortfarande **NOT REPRODUCIBLE**;
  - B14 är **INFO** (AAA).
- **Fortfarande öppet från 8M:** B2 (Mat, rubriknivå), B3 (Ekonomi,
  landmärken), B4 (GlobalSearch), B10 (språk), B13 (native-dialoger) och B-N4
  (i18n-nycklar).
- **Inga nya A-fynd.**
- **Åtta nya B-fynd (B-8T-N1–N8):**
  - generellt fokustapp när fokuserade element tas bort;
  - Må bra-reflow vid 320 px;
  - klippt råd på Hem vid extra stor text;
  - tyst tomt formulär i 65+;
  - namngivna `generic`-noder utanför AI Coach;
  - stora live-behållare i AI Coach;
  - dubbla h1 i sju Mer-mappar;
  - "Ring 112" 19 px hög.
- **Tre nya C-luckor (C-8T-N1–N3).**
- **Testluckor:** de flesta från 8M är täckta nu. Kvar är C12 (CI), C15
  (Ekonomis tabell) och C16 (riktig walkie-talkie), och C9 och C11 är delvis
  täckta.

## 2. Baslinje

| Kontroll | Förväntat | Resultat |
|---|---|---|
| `test:a11y` | 487/487 | **487/487** |
| `test:a11y:e2e` | 196/196 | **196/196** (16,9 min) |
| Full Vitest | 96 kända fel, 4376 godkända | **96 / 4376, inga nya fel** |
| `PlaceSection.test.jsx` | 20 / 19 | **20 / 19** |
| `i18n:check`, `i18n:hardcoded` | OK, 0 | OK, 0 signaler |
| `build`, `git diff --check` | OK | OK |
| Lint | 51 | 51 (sonderna gav 3 tillfälliga `no-undef`, som försvann när de togs bort) |

Inga avvikelser.

## 3. Status för alla 8M-fynd

### A-fynd

| ID | Beskrivning | Status | Bevis (8T) | WCAG |
|---|---|---|---|---|
| A1 | Navigeringskontrast | FIXED | `navigation-contrast.spec.js` grön | 1.4.3 |
| A2 | Dolda fokuserbara kontroller på Hem | FIXED | `hidden-controls`, `focus-visibility` gröna; 0 dolda stopp på Hem | 2.4.7, 4.1.2 |
| A3 | Fokus bakom navigeringen | FIXED | `focus-visibility` (6 vyer × 4 lägen) grön | 2.4.11 |
| A4 | Upprepade live-uppläsningar | FIXED | `live-motion` grön; live-regioner på Hem: "Online" + två tomma status | 4.1.3 |
| A5 | Appens "Minska rörelse" | FIXED | 0 körande animationer med appinställningen (sanitetskontroll: utan den körs pulser och `smooth`-scroll) | 2.3.3 |
| A6 | GlobalSearch-fälla | FIXED | `keyboard.spec` grön; 8T: Escape stänger, fokus till öppnaren | 2.1.2 |
| A7 | Redo!-bekräftelsen | FIXED | `keyboard.spec` grön | 4.1.3 |
| A8 | Plats-korten | FIXED | `place-cards` och `forced-colors` gröna | 2.1.1 |
| A-N1 | Mat 286 px sidledsscroll | FIXED (8P) | 0 px i alla Mat-paneler; `mat-reflow` och Mer-gaten gröna | 1.4.10 |
| A-N2 | AI Coach-kontrast | FIXED (8O) | axe 0; `ai-coach.spec` kontrast grön | 1.4.3 |
| A-N3 | `aria-label` på `div` (37 noder, AI Coach) | FIXED (8O) | 0 namngivna `generic` i AI Coach-mappen. Samma mönster finns utanför AI Coach, se B-8T-N5. | 4.1.2 |
| A-N4 | Dolda filväljare som Tab-stopp | FIXED för Dataimport, Framsteg, Mat och mathistorik (8N, 8P). **BLOCKED — CURSOR-OWNED** för Molnbackup. | Tab-pass: enda dolda stoppet i 23 vyer är `CloudBackupPanel` ("Importera molnbackup från JSON-fil") | 2.4.7 |

### B-fynd (8H/8M)

| ID | Beskrivning | Status | Bevis | Vy/fil | WCAG | Allvar | Nästa åtgärd |
|---|---|---|---|---|---|---|---|
| B1 | AI Coach saknar h1 | FIXED | h1 "AI Coach" | – | 1.3.1 | – | – |
| B2 | Mat h1 → h3 | **STILL OPEN** | axe `heading-order` (moderate) på `#nutrition-action-plan-title`. Synlig sekvens: h1 "Mat", h1 "Mat", h3 "Rekommendationer". Det är det enda hoppet i alla 23 vyer. Mat har dessutom dubbla h1 (se B-8T-N7). | `NutritionActionPlan.jsx` / `NutritionSection` | 1.3.1 | Låg | Gör "Rekommendationer" till h2, eller lägg till en h2-nivå. Ta bort den dubbla h1. |
| B3 | Ekonomi `landmark-unique` | **STILL OPEN** | axe moderate: två regioner heter "Ekonomi" (`#app-section-economy` och `economy-activation`) | `EconomyCenter.jsx` / `MoreSection` | 1.3.1 | Låg | Ge aktiveringsregionen ett eget namn, eller ta bort dess regionroll |
| B4 | GlobalSearch: antal och mönster | **STILL OPEN** | Ingen live-region i dialogen, så antalet träffar meddelas inte. `searchbox` med `aria-activedescendant`, men utan `aria-expanded`. **4 av 4 alternativ är också Tab-stopp**, vilket blandar två mönster. Listboxen innehåller `section` med `aria-label`. Escape och fokusretur fungerar. | `GlobalSearch.jsx` | 4.1.3, 4.1.2 | Medel | Combobox-mönstret: `role="combobox"`, `aria-expanded`, alternativ med `tabIndex=-1`, grupper som `role="group"`, och en polite-status med antal träffar |
| B5 | Hem-länkar 14 px | FIXED (8R) | 148×24 och 56×24 | – | 2.5.8 | – | – |
| B6 | Redo tomt fält | FIXED (8Q) | `feedback-status-focus` grön. Mönstret saknas i 65+, se B-8T-N4. | – | 3.3.1 | – | – |
| B7 | Väderstatus | FIXED (8Q) | Polite status; `feedback-status-focus` grön | – | 4.1.3 | – | – |
| B8 | Redo-ellips | FIXED (8R) | 0 klippning i Redo i fyra lägen. Liknande fynd på Hem, se B-8T-N3. | – | 1.4.4 | – | – |
| B9 | Mjuk scroll i AI Coach | FIXED | `scroll-behavior: auto` med reduce; `live-motion` grön | – | 2.3.3 | – | – |
| B10 | Hårdkodad svenska / `sv-SE` | **STILL OPEN** | Se avsnitt 18 för detaljerna | se 18 | 3.1.2 | Medel (icke-svenska användare) | Produktbeslut om taligenkänningens språk. Flytta texterna till i18n. |
| B11 | Forced colors | FIXED (8S), **MANUAL VERIFICATION REQUIRED** | 8S-gaten och 8T-svepet: 0 otydliga tillstånd och 0 progressbars utan spår i 23 vyer | – | 1.4.11 | – | Manuellt i Windows |
| B12 | Dubbla "Online" | NOT REPRODUCIBLE | Offline: bara `pwa-network-pill` muterar ("Offline"). `GlobalSyncStatus` (polite, i Mer) ändras inte. | – | 4.1.3 | – | – |
| B13 | `window.prompt` / `confirm` | **STILL OPEN** | **30 `confirm` och 9 `prompt`** (se 19) | se 19 | 3.3.2, 4.1.2 | Låg–medel | Tillgängliga dialoger (`ModalDialog`), och datum/tid som formulärfält |
| B14 | AAA-kontrast | INFO | Inte omgranskat (AAA) | – | 1.4.6 | Info | – |
| B-N1 | Label in name i AI Coach | FIXED (8O) | Axe `label-content-name-mismatch` i 23 vyer: bara Body Scan (Cursor) | – | 2.5.3 | – | – |
| B-N2 | Kryssrutor under 24 px | FIXED (8R) | 8T-svep: inga kryssrutor med träffyta under 24 | – | 2.5.8 | – | – |
| B-N3 | `summary` 19 px | FIXED (8R) för AI Coach. **BLOCKED — CURSOR-OWNED** för Inställningar. | "Jämför abonnemang" och "Radera konto och data" är 336×19 (avståndsundantaget klaras) | `MoreSection` Inställningar | 2.5.8 | Låg | Cursor: `min-height: 24px` |
| B-N4 | `settings:*Error` | **STILL OPEN** | Konsolen varnar i varje körning. `MoreSection` läser `['settings', 'common']`, men `nutritionError`, `coachError` m.fl. finns bara under `journey` (`resources.js:1255`). `defaultValue` på svenska används, så engelska användare ser svensk feltext. Råa nycklar visas inte. | `MoreSection.jsx:194–262`, `i18n/resources.js` | 3.1.2 (indirekt) | Låg | Lägg nycklarna i `settings` (sv och en) |

### C-luckor (8M)

| ID | Lucka | Status 8T | Bevis |
|---|---|---|---|
| C1 | Axe på huvudvyer | COVERED | `axe-views.spec.js` |
| C2 | Plats med samtycke | COVERED | `place-cards.spec.js` |
| C3 | Mer-mappar i gaten | **COVERED** | `more-folders.spec.js`: 17 mappar, axe, fokus, reflow |
| C4 | Moderate blockerande | **PARTIAL** | Huvudvyerna och AI Coach blockerar på moderate. Övriga Mer-mappar bara på critical och serious. Därför når B2 och B3 aldrig gaten. |
| C5 | Skymd fokus | COVERED / PARTIAL | Huvudvyerna i fyra lägen. Mer-mapparna kontrolleras för dolt fokus men inte för skymd fokus i 200 %/320 px. |
| C6 | Fokus på osynliga kontroller | **COVERED** | Gaten för dolt fokus (8N) i `focus-visibility` och `more-folders`, plus fixturtest |
| C7 | Live-brus | COVERED | `live-motion.spec.js` |
| C8 | GlobalSearch och Redo | COVERED | `keyboard.spec.js` |
| C9 | jsdom-fällor | **PARTIAL** | Riktigt tangentbord nu även för Redo-dialogen (`forced-colors`, `feedback-status-focus`). Väderdialogen verifierades i 8T, men inte i sviten. Place, Social och Coach stage har fortfarande bara jsdom eller axe. |
| C10 | `click()` | COVERED | – |
| C11 | jsdom kontra Chromium | PARTIAL (strukturell) | Oförändrat |
| C12 | Webbläsarrevision och CI | **STILL OPEN** | Inga `.github/workflows`. Lokalt används Chromium 1194. |
| C13 | Axe-regler utanför gaten | PARTIAL | Label-in-name och target-size körs explicit, forced colors har egen gate. Experimentella regler och AAA bara i audit. |
| C14 | Formulärfel | **PARTIAL** | Redo och väder är gatade (8Q). Övriga formulär saknar test. 65+ är tyst, se B-8T-N4. |
| C15 | Ekonomis tabell | **STILL OPEN** | `sr-only`-tabellen har `caption` och radrubriker (`th`), men inga kolumnrubriker för belopp och procent, och inget test |
| C16 | Walkie-talkie och strömning | **STILL OPEN** | Fortfarande fixturbaserat (`walkieHarness.js`) |
| C-N1 | Mer-mappar i gaten | COVERED | se C3 |
| C-N2 | Kontroll som själv är `sr-only` | COVERED | se C6 |
| C-N3 | Väderdialogen och Coach stage | **PARTIAL** | Väder: med mockad Open-Meteo och geolokalisering gick dialogen att öppna. h1 via `aria-labelledby`, fokus på "Stäng", bakgrunden `inert`, ingen utgång i 25 Tab, Escape återför fokus till "Visa hela dagen". Det finns inget permanent test. Coach stage är inte verifierad. |

## 4. Kvarvarande Severity A

Inga. Den enda A-delen som återstår är Molnbackups dolda filväljare (A-N4), som
är **BLOCKED — CURSOR-OWNED** (se 20).

## 5. Kvarvarande Severity B

B2, B3, B4, B10, B13 och B-N4 från 8M (se 3), plus de nya B-8T-N1–N8 (se 7).

## 6. Kvarvarande Severity C

C4, C5 (Mer-mapparna i zoom-lägen), C9, C11, C12, C13, C14, C15, C16 och C-N3
(se 3), plus de nya C-8T-N1–N3 (se 7).

## 7. Nya fynd

### Severity B

| ID | Fynd | Reproduktion och bevis | WCAG | Fil | Rekommendation | Sprint |
|---|---|---|---|---|---|---|
| **B-8T-N1** | Fokus faller till `<body>` när fokuserat innehåll tas bort. 8Q löste det bara för Mat. | AI Coach: Enter på "Markera sedd" → kortets knapp försvinner → `BODY`. Redo: radera sak, "Ja, radera" → dialogen stänger och fokusretur går till den raderade radens knapp → `BODY`. "Hjälpsamt" och "Inte nu" behåller fokus. | 2.4.3 | `AchievementCenter.jsx` (acknowledge), `ReadySection.jsx` (radera + `ModalDialog` returnFocus) | Samma princip som 8Q: fokus till nästa logiska kontroll (nästa kort, listan eller rubriken). Dialogens fokusretur behöver en reserv när öppnaren inte längre finns. | 8U |
| **B-8T-N2** | Må bra har sidledsscroll vid 320 px | 320 px: **32 px**. Extra stor text vid 320 px: **98 px**, och vid 390 px: 28 px. `.wellbeing-accordion-trigger` är en flex-rad där metatexten ("Ingenting sparas förrän du väljer …") inte krymper. Plus/minus-ikonen hamnar på x 324–352, och vid stor text hamnar texten på x 41–380, alltså utanför skärmen. Mer-gaten mäter bara 390 px normalt och missar därför felet. | 1.4.10 | `wellbeing`-accordionen (CSS) | `min-width: 0` och radbrytning på metatexten. Lägg till 320 px i Mer-gatens reflowtest. | 8U |
| **B-8T-N3** | Hem: rådet klipps vid extra stor text | `.daily-coach-advice` har `-webkit-line-clamp: 4`. Vid extra stor text och 320 px är innehållet 122 px och synligt 91 px. "En promenad på 20 minuter kan förbättra dagens resultat." klipps. | 1.4.4 | `App.css` (Hem-regeln med `line-clamp`) | Ingen `line-clamp` vid förstorad text, samma princip som 8R | 8U |
| **B-8T-N4** | "65+ · Min vardag": tomt formulär är tyst | Skicka tomt formulär ("Lägg till" med tomma fält): ingen `aria-invalid`, ingen status, fokus kvar på knappen, inget sparas. Samma fel som B6. Inkasso och Kronofogden använder native `required` (webbläsarvalidering och fokus till första fältet). | 3.3.1 | Senior-komponenten ("Lägg till" medicin/vardag) | 8Q-mönstret: statusregion, `aria-invalid` och `aria-describedby` | 8U |
| **B-8T-N5** | `aria-label` på `generic` utanför AI Coach (samma mönster som A-N3) | Chromes tillgänglighetsträd visar namngivna `generic`-noder, och axe flaggar inte element med innehåll. Hem: `.overview-live-meta` "Datum, tid och väder", `.smart-feed-reference-controls` "Styr Viktkollen Live", `.overview-quick-buttons` "Viktiga snabbknappar". Redo: `.ready-progress-ring` "0 av 0 klara" (dubblerar texten). Stället: "Välj ljudmiljö" och "Välj avstängningstimer". Teckenspråk: `span.ready-avatar-button` "Välj avatar". Djurvärlden och Graviditet: "Mediaförhandsvisning". Import & Export: `.meal-list` "Valbara exportsektioner". | 4.1.2, 1.3.1 | OverviewDashboard, ReadyChecklistCard, SocialRoom, EducationMedia m.fl. | Samma klassning som 8O: grupp → `role="group"`, värde → ingen `aria-label`. Utöka 8O:s kontroll av namngivna `generic` till alla vyer. | 8V |
| **B-8T-N6** | Stora polite-live-behållare | AI Coach-mappen har polite-regioner med 316–447 tecken och 12–28 barn: `HabitGoalCenter` och `HealthJourneyCenter` (`.reminder-summary-grid`), `AdaptiveCoachWeeklyPlan` och `AdaptiveCoachPanel` (`.insight-plan`). Varje dataändring kan läsa upp hela rutnätet. (Obs: `HabitGoalCenter.test.jsx` förväntar sig `aria-live="polite"`.) | 4.1.3 | se ovan | En kort `sr-only`-status med det som ändrades, i stället för live på hela rutnätet | 8V |
| **B-8T-N7** | Dubbla h1 i Mer-mappar | Synligt två identiska h1 i Framsteg, Mat, Må bra, Ekonomi, Teckenspråk, Djurvärlden och Graviditet. Mappens h1 och sektionens egen h1 visas båda. | 1.3.1 (best practice) | `MoreHub` och sektionerna | En h1 per mapp; sektionens rubrik blir h2. Hör ihop med B2. | 8V |
| **B-8T-N8** | "Ring 112" är 19 px hög | Graviditet & första året: `a.primary-button` "Ring 112" är 81×19. Avståndsundantaget klaras, så AA är uppfyllt. Men det är en nödfunktion. | 2.5.8 (AA uppfyllt), 2.5.5 | Graviditetssektionen | Minst 24 px, helst 44 px | 8U |

### Severity C

| ID | Lucka | Rekommendation |
|---|---|---|
| **C-8T-N1** | Mer-gatens reflowtest körs bara vid 390 px normalt, så B-8T-N2 missas | Lägg till 320 px och extra stor text vid 320 px för alla 17 mappar |
| **C-8T-N2** | Kontrollen av namngivna `generic` finns bara för AI Coach | Kör den i alla vyer (fångar B-8T-N5) |
| **C-8T-N3** | Väderdialogen har inget permanent tangentbordstest, fast den nu går att testa med mock | Permanent test med mockad Open-Meteo |

## 8. Tangentbord

Tangentbordspasset i 23 vyer (riktigt Tab, 8N-gaten):
- 0 dolda eller osynliga fokusmål, utom Molnbackup (Cursor);
- 0 fällor;
- sidledsscroll 0 vid 390 px.

**Kontrollerat i 8T:**
- **Skip link:** blir synlig vid fokus (sviten).
- **Bottennavigeringen:** alla sex länkar är Tab-stopp i ordning; Enter byter
  sektion.
- **GlobalSearch:** fokus i fältet vid öppning. Pil ned flyttar
  `aria-activedescendant`. Tab går till "Stäng" och sedan till alternativen,
  vilket är B4 (blandat mönster). Escape stänger och fokus går till "Öppna
  global sökning".
- **Dialoger:**
  - AI-kompisen (Redo): namngiven, modal, fokus inuti, Escape stänger och
    fokus återförs;
  - väderdagen: se C-N3;
  - Redo-radering: fokus inuti, men efter "Ja, radera" hamnar fokus på `BODY`
    (B-8T-N1);
  - AI Coach: `keyboard.spec`;
  - alarm: `alarm.spec`.
- **Filväljare:** se A-N4.
- **Accordions:** native `summary`, där Enter och Space fäller ut (8R-testet).
- **Kryssrutor:** Space.

**Pilar:** GlobalSearch har pilnavigering. Ställets `tablist` testades inte
med pilar i 8T (se manuell lista).

## 9. Fokushantering

- **Dialoger:** `ModalDialog` och `useDialogA11y` (`inert`, fälla, Escape och
  fokusretur) fungerar i de testade dialogerna.
- **Generellt problem:** borttagning av fokuserat innehåll (B-8T-N1).
  8Q:s Mat-lösning var lokal. AI Coach "Markera sedd" och Redo-radering (via
  dialogens retur) tappar fortfarande fokus.
- **Sökning:** OK, utom mönstret (B4).
- **Status- och felflöden:** Redo och väder flyttar inte fokus, vilket är rätt.
  Inkasso och Kronofogden: webbläsaren fokuserar första ogiltiga fält.

## 10. Tillgänglighetsträdet

- **Namngivna `generic`:** 0 i AI Coach, men 10 utanför (B-8T-N5).
- **Kontroller utan namn:** 0 i alla 23 vyer (button, link, textbox, checkbox,
  combobox, slider, radio, switch, tab).
- **Label in name:** bara Body Scan (Cursor).
- **Tillstånd:**
  - Min resa har nu `aria-pressed` (8S);
  - Stället har `role="tab"` med `aria-selected`;
  - chips har `aria-pressed`;
  - Nivåprogress är `progressbar` med ett värde (8O).
- **Överskriven text:** väderstatusens `aria-label` är borttagen (8Q). Inga
  nya fall hittades.
- **GlobalSearch-listboxen** innehåller `section` med `aria-label` (B4).

## 11. Rubriker och landmärken

| Vy | h1 | Hopp | Dubbla landmärken |
|---|---|---|---|
| Hem | 1 (visuellt dold "Hem" i headern) | 0 | 0 |
| Redo, Plats, Min resa, Stället, Mer | 1 | 0 | 0 |
| Mat | 2 (dubbel "Mat") | **h1 → h3 "Rekommendationer"** (B2) | 0 |
| Ekonomi | 2 | 0 | **2 × region "Ekonomi"** (B3) |
| Framsteg, Må bra, Teckenspråk, Djurvärlden, Graviditet | 2 (dubbla) | 0 | 0 |
| Övriga 10 mappar | 1 | 0 | 0 |

B2 är det enda rubrikhoppet i appen. Dubbla h1 finns i 7 mappar (B-8T-N7).

## 12. Formulär och fel

| Formulär | Tomt formulär | Resultat |
|---|---|---|
| Redo "Lägg till sak" | status, `aria-invalid`, `describedby` | OK (8Q) |
| Inkasso, Kronofogden | native `required` (2 fält) | Webbläsarens bubbla och fokus till första ogiltiga fält. Acceptabelt, men uppläsningen varierar mellan webbläsare och skärmläsare, så den kräver manuell test. |
| 65+ "Lägg till" | ingenting | **Tyst** (B-8T-N4) |
| Väder | status | OK (8Q) |
| Mat-importen och mathistoriken | status efter val | OK (8P) |

Alla fält i de testade formulären har namn (etikett eller `aria-label`).

## 13. Live-regioner

| Vy | Regioner |
|---|---|
| Hem, Redo | "Online" (pill, polite), plus två tomma `status` (väder och Live eller Redo-fel) |
| Plats, Min resa, Stället, Må bra | bara "Online" |
| Mer | "Online" och `GlobalSyncStatus` (`role="status"` + polite, "Online ☁ Automatisk synk är av"). Offline muterar bara pillen, så B12 går inte att reproducera. |
| Mat | "0 visas" (status) och skannerns hjälptext (polite) |
| AI Coach | **6 polite-behållare, varav fyra med 316–447 tecken** (B-8T-N6) |

8J (ingen rotation eller brus vid reduced motion) och 8Q (Redo, väder) är
gröna i sviten. Walkie-talkie och alarm: se `alarm.spec` och manuell lista.

## 14. Reflow och stor text

Lägen:
- 320 px;
- extra stor text vid 320 px;
- 200 % (640 × 400, dsf 2);
- extra stor text vid 390 px.

Detektering: sidledsscroll, ellips och klippning med Range, `line-clamp` och
text utanför skärmen, i 23 vyer (92 körningar).

| Vy | Fynd |
|---|---|
| Må bra | **Sidledsscroll** 32 / 98 / 28 px (B-8T-N2) |
| Hem | **`line-clamp`** klipper rådet vid extra stor text och 320 px (B-8T-N3) |
| Stället | Chipsrader ("Tavlan", "Spel", "Spa", "30 minuter") ligger utanför skärmen, men i egna horisontella scrollbehållare utan sidledsscroll på sidan. Fokus scrollar dem i vy (8I). Det är ett tillåtet mönster, men kontrollera touch manuellt. |
| Alla övriga | 0 |

Redo (8R) och Mat (8P) är rena i alla lägen.

## 15. Träffytor

Egen mätning av den verkliga träffytan (etiketten för kryssrutor) för alla
kontroller i 23 vyer. Inbäddade länkar i löptext är undantagna.

| Kontroll | Vy | Träffyta | Avståndsundantag | Status |
|---|---|---|---|---|
| "Ring 112" | Graviditet | 81 × 19 | OK | B-8T-N8 |
| "Jämför abonnemang" (summary) | Inställningar | 336 × 19 | OK | BLOCKED — CURSOR-OWNED |
| "Radera konto och data" (summary) | Inställningar | 336 × 19 | OK | BLOCKED — CURSOR-OWNED |

Inga andra kontroller under 24 × 24. Axe `target-size` gav 0 fynd överallt, så
det var bara den egna mätningen som hittade dessa.

## 16. Forced colors

- **AUTOMATED PASS:**
  - `forced-colors.spec.js` är grön (6 tester);
  - 8T-svepet i 23 vyer: 0 valda tillstånd som ser ut som icke valda, och 0
    progressbars utan spår;
  - fokus: outline finns i alla vyer (8S-inventering, oförändrat).
- **MANUAL WINDOWS VERIFICATION REQUIRED:**
  - riktiga Windows-kontrastteman i Edge, Chrome och Firefox;
  - emoji och bilder på Hem-korten;
  - SVG-ringar (Mat och Body Scan);
  - valda chips med Highlight i mörka teman.

## 17. Reduced motion

| Läge | Körande animationer (Hem, Redo, Stället, AI Coach, Mat, Må bra) | `scroll-behavior` |
|---|---|---|
| Utan reduktion (sanitetskontroll) | Hem: "Tryck på bilden"-puls, Body Scan-ringar (oändliga) | `smooth` |
| OS `prefers-reduced-motion` | 0 | `auto` |
| Appens "Minska rörelse" | 0 | `auto` |

8J håller, och inga nya missar hittades. Body Scan-ringarna stoppas vid
reduktion.

## 18. Språk och i18n (B10, B-N4)

- **Taligenkänning:** `voiceConversationController.js:331` har
  `recognition.lang = 'sv-SE'`, oberoende av appens språk.
- **Talsyntes:** har reserv till `sv-SE` men följer annars appens eller
  rösternas språk (`NoticeHub`, `AiCoachOverlay`, `notificationSchedulerBridge`,
  `NoticeKitchenTimers`). Undantag: `bodyAnalysisVideoScan.js:590` är
  hårdkodat till `sv-SE` (Body Scan, Cursor).
- **Plats (`PlaceSection.jsx`) har hårdkodad svenska:**
  - trygghetslarmets val (rad 65–80: "Jag känner mig hotad", "Jag har gått
    vilse" …);
  - `pushStatus`-texten (112);
  - "Stäng notis" (617);
  - "Platsdelning aktiv" (715);
  - växlarna för säkra platser (732–733).
- **`PlaceVoiceCallPanel.jsx:32`:** `aria-label` "Prata med {namn}" är
  hårdkodat.
- **B-N4:** se 3. Engelska användare får svensk felrubrik om en mapp kraschar.
- **Mer hårdkodad svenska i `aria-label` och text** (t.ex. `AchievementCenter`,
  `SmartNotificationsCard`, `DataImportCenter`): `i18n:hardcoded` prioriterar
  dem inte (0 signaler), men de är inte översatta.
- `document.documentElement.lang` följer appens språk (`i18n/index.js:76`).

## 19. Native-dialoger (B13)

Totalt **30 `window.confirm` och 9 `window.prompt`**, inga `window.alert`.

| Fil | Anrop | Användningsfall | Risk |
|---|---|---|---|
| `ProgressCenter.jsx` | 7 confirm, 3 prompt | radera vikt/mått/rapport, **kopiera: datum och tid via `prompt`**, importläge via `prompt` | Fritext för datum/tid saknar format, validering och fel (3.3.2) |
| `MealLogger.jsx` | 4 confirm, 5 prompt | **kopiera måltid och favorit: datum och tid via `prompt`**, importläge, radera | Samma |
| `WeeklyMealPlanner.jsx` | 5 confirm | radera, ersätt, rensa | Native modal: OK för tangentbord, men varken stilad eller översatt |
| `CloudBackupPanel.jsx` | 4 confirm | återställ, radera, importera, ångra | **BLOCKED — CURSOR-OWNED** |
| `ManualAcceptanceRunner.jsx` | 2 confirm | testdata (utvecklingsverktyg) | Låg |
| `App.jsx` | 2 confirm | rensa coachhistorik, radera framstegsbild | Låg–medel |
| `ProgressPhotos.jsx` | 1 prompt | redigera anteckning | Fritext i `prompt` |
| `AccessibilityHub.jsx` | 1 confirm | återställ tillgänglighetsinställningar | Låg |
| RecipeManager, MealQuickAdd, CoachMemoryReview, DietaryPreferencesPanel, GoalsHabitsPanel | 1 confirm var | radera, rensa | Låg |

**Rekommendation:**
1. Ersätt de 9 `prompt` med formulärfält i en `ModalDialog`: `input type=date`
   och `time`, etikett, fel och status.
2. Ersätt `confirm` med en återanvändbar bekräftelsedialog (`ModalDialog` +
   `alertdialog`), med samma mönster som Redo-raderingen.

Datum och tid först (MealLogger, ProgressCenter).

## 20. Cursor-ägda fynd (BLOCKED — CURSOR-OWNED)

| Område | Fynd | Minimal rekommendation |
|---|---|---|
| Molnbackup | Dold filväljare är ett Tab-stopp (A-N4), och 4 `confirm` | `tabIndex={-1}` och `aria-hidden` på inputen (se 8N). En tillgänglig bekräftelsedialog. |
| Body Scan (Hem-kortet) | `label-content-name-mismatch`: "Öppna kroppsscanning i helskärm" mot den synliga texten | Namnet ska börja med den synliga texten |
| Body Scan | Hårdkodad talsyntes med `sv-SE` (`bodyAnalysisVideoScan.js:590`) | Följ appens språk |
| Smart Camera (AI Ögat från Redo) | Dialogen öppnas utan att fokus flyttas in, och Escape stänger den inte | `ModalDialog` (initialt fokus, Escape och fokusretur) |
| Inställningar (billing, account deletion) | `summary` "Jämför abonnemang" och "Radera konto och data" är 336 × 19 | `min-height: 24px` |

## 21. Manuell verifiering (prioriterad)

| Prioritet | Test | Vad |
|---|---|---|
| **HIGH** | VoiceOver iPhone | Rubriknavigering (B2, B-8T-N7), statusmeddelanden (Redo-fel, väder, Mat "Dölj"), GlobalSearch (B4), alarmet, `inert` bakom dialoger |
| **HIGH** | TalkBack Android | Samma som VoiceOver, plus träffytor med touch-utforskning |
| **HIGH** | NVDA Windows (Firefox och Chrome) | Live-regioner i AI Coach (B-8T-N6), GlobalSearch, formulärfel (Redo och native `required`), `aria-pressed` och `aria-current` |
| **HIGH** | Windows kontrastteman | Allt i 16 (manuellt) |
| **HIGH** | Walkie-talkie mellan två riktiga enheter | Håll-inne, status och uppläsning (C16) |
| **HIGH** | Alarm | Låst skärm, bakgrund, vibration och visuellt larm |
| MEDIUM | JAWS (där tillgängligt) | Stickprov: dialoger, formulär och navigering |
| MEDIUM | Verklig webbläsarzoom 200–400 % | Må bra (B-8T-N2), Hem-rådet (B-8T-N3), Ställets chipsrader |
| MEDIUM | iOS Dynamic Type och Android font scale | Om appens textstorlek och OS-textstorlek samverkar |
| MEDIUM | Taligenkänning på andra språk än svenska | B10 |
| MEDIUM | Röststyrning (iOS Röststyrning, Voice Access, Dragon) | Namn som skiljer sig från synlig text (Body Scan), versaler i etiketter, "Visa nästa feed-kort" |
| LOW | Brytarstyrning | Plats-korten, larmet och walkie-talkien |
| LOW | Touch | Ställets chipsrader (scrollbehållare), "Ring 112" |
| LOW | Tangentbordspilar i Ställets `tablist` | Pilnavigering enligt tab-mönstret |

## 22. Rekommenderad sprintordning

1. **A11Y-8U: fokusåterställning, reflow och formulär (B-8T-N1, N2, N3, N4 och
   N8, plus C-8T-N1).** Generell fokusreserv vid borttagning (AI Coach
   "Markera sedd" och Redo-radering), Må bra-reflow, `line-clamp` på Hem, tomt
   formulär i 65+, "Ring 112" på 24–44 px, och 320 px i Mer-gaten. Det är
   användarpåverkan för tangentbord och zoom med liten risk.
2. **A11Y-8V: semantik och struktur (B-8T-N5, N6, N7, B2, B3, plus C-8T-N2 och
   C4).** Namngivna `generic`, stora live-behållare, dubbla h1, Mat-rubriken,
   Ekonomis landmärke, och moderate blockerande i alla Mer-mappar. Kräver att
   `HabitGoalCenter.test.jsx` uppdateras medvetet.
3. **A11Y-8W: GlobalSearch (B4).** Combobox-mönster med status för antal
   träffar.
4. **A11Y-8X: native-dialoger (B13).** Datum och tid först, sedan bekräftelser
   (Claude-ägda filer). Molnbackup samordnas med Cursor.
5. **Senare eller kräver beslut:**
   - B10 och B-N4 (språk: produktbeslut om taligenkänning, i18n-nycklar);
   - C12 (CI med pinnad Chromium);
   - C15 (kolumnrubriker och test);
   - C16 och C-8T-N3 (test av väderdialogen);
   - manuell verifiering enligt 21.
6. **Cursor-överlämning:** avsnitt 20.
