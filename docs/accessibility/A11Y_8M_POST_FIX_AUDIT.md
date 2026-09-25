# A11Y-8M: Djup re-audit efter A1–A8

Granskningen är read-only. Ingen produktionskod och inga tester har ändrats,
och de tillfälliga auditskripten är borttagna. Underlaget är
`claude/parallel-1` på `c317f8e`. `origin/main` stod på `21907f1` (Cursor,
Supabase-testmiljön för account deletion), utan överlappning.

## A. Sammanfattning

- **Alla åtta A-fynd från 8H är fortfarande lösta.** Varje fynd har en egen
  regressionsgate i sviten, och alla gick igenom: `test:a11y` 487/487 och
  `test:a11y:e2e` 107/107.
- **Huvudvyerna är rena på AA.** Hem, Redo!, Plats (även med samtycke), Min
  resa, Stället, Mer, Tillgänglighet med sina 8 undersektioner, och Notis ger
  0 axe-fynd på critical, serious och moderate. Undantaget är det dokumenterade
  Body Scan-kortet.
- **De nya fynden finns i Mer-mapparna, som inte ingår i gaten (C3).** Fyra
  nya A-fynd hittades där:
  - Mat har horisontell scroll på 286 px.
  - Badges i AI Coach-mappen har kontrast ned till 1,8:1.
  - `aria-label` sitter på generiska `div` (37 noder), så värden som
    "Nivåprogress: 20 %" annonseras inte.
  - Tangentbordsfokus hamnar på visuellt dolda filväljare.
- **B-fynd:** av 14 är 2 lösta, 1 går inte längre att återskapa, 10 är öppna
  och 1 är bara information (AAA).
- **Testluckor:** 16 luckor totalt. 7 är täckta, 5 är delvis täckta och 4 är
  öppna.

## B. A1–A8

| # | Fynd | Status | Bevis (automatiskt, Chromium) |
|---|---|---|---|
| A1 | Navigeringskontrast | PASS | `navigation-contrast.spec.js`: alla etiketter, aktiva och inaktiva, minst 4,5:1 i 7 vyer, normalt och i högkontrast. Axe-gate för huvudsektionerna. |
| A2 | Dolda fokuserbara kontroller på Hem | PASS | `hidden-controls.spec.js` och `focus-visibility.spec.js` (utan undantag) |
| A3 | Fokus bakom bottennavigeringen | PASS | `focus-visibility.spec.js`: 6 vyer i 4 lägen (normal, 200 %, 320 px, stor text) |
| A4 | Upprepade live-uppläsningar | PASS | `live-motion.spec.js` G. Auditen: 0 live-mutationer på 25 s på Hem. |
| A5 | Appens "Minska rörelse" | PASS | `live-motion.spec.js` C/D/E |
| A6 | GlobalSearch-fälla | PASS | `keyboard.spec.js` (riktigt Tab/Shift+Tab, inert, Escape, fokusretur) |
| A7 | Redo!-bekräftelsen | PASS | `keyboard.spec.js` och `focusAndConfirm.test.jsx` |
| A8 | Plats-korten | PASS | `place-cards.spec.js`. Auditen: fokusringen syns även i forced colors (2 px, systemfärg). |

Ingen regression hittades.

## C. B1–B14 (från 8H)

| # | Fynd | Status | Reproducerat? | WCAG | Allvar | Fil | Sprint |
|---|---|---|---|---|---|---|---|
| B1 | AI Coach-mappen saknar h1 | **FIXED** (indirekt) | Nej. Mappen har nu h1 "AI Coach". | 1.3.1 | – | – | – |
| B2 | Mat hoppar från h1 till h3 | OPEN | Ja, axe `heading-order` (`#nutrition-action-plan-title`) | 1.3.1 | Låg | Mat-mappen (NutritionSection) | Struktur |
| B3 | `landmark-unique` i Ekonomi | OPEN | Ja, `#app-section-economy` | 1.3.1 | Låg | EconomyCenter / MoreSection | Struktur |
| B4 | GlobalSearch annonserar inte antal träffar; blandat mönster | OPEN | Ja: ingen live-region i dialogen, och 5/5 alternativ är både Tab-stopp och `aria-activedescendant` | 4.1.3, 4.1.2 | Medel | `GlobalSearch.jsx` | Dialoger |
| B5 | "Visa fler råd" och "Visa alla" 14 px höga | OPEN | Ja, 148×14 och 56×14. axe godkänner via avståndsundantaget. | 2.5.8 (gräns), 2.5.5 | Medel | Hem (DailyCoachCard / SmartNotificationsCard) | Träffytor |
| B6 | Tomt "Lägg till sak" ger ingen återkoppling | OPEN | Ja, inget fel och ingen `aria-invalid` | 3.3.1 | Låg–medel | ReadyChecklistCard | Formulär |
| B7 | "Koppla väder" annonserar inte status eller fel | OPEN | Ja, "Hämtar väder…" visas men ligger inte i en live-region | 4.1.3 | Medel | OverviewDashboard / OverviewLiveMeta | Status |
| B8 | Redo!-plattor med ellips | OPEN | **Ja, vid extra stor text:** "Inget planerat ännu" klipps | 1.4.4, 1.4.12 | Medel | `.ready-info-tile-copy` | Text/reflow |
| B9 | Mjuk scroll i AI Coach trots reduced motion | **FIXED** (8J) | Nej, `live-motion.spec.js` H | 2.3.3 | – | – | – |
| B10 | Hårdkodad svenska; taligenkänning `sv-SE` | OPEN | Ja: `voiceConversationController.js:331`, samt Trygghetslarm-texter i `PlaceSection.jsx` (652, 666, 683) och `PlaceVoiceCallPanel.jsx` | 3.1.2 | Medel (för icke-svenska användare) | se ovan | Språk (kräver beslut om taligenkänningen) |
| B11 | Inget stöd för forced colors | OPEN | Ja, 0 regler i CSS. Emulering: aktiv navigeringslänk skiljs bara med bakgrund; fokusringar (outline) finns kvar. Bekräftas manuellt. | 1.4.1, 1.4.11 | Medel | `accessibility.css` | Forced colors |
| B12 | Dubbla "Online"-statusar | **NOT REPRODUCIBLE** | Nej, bara `pwa-network-pill` är live, och Appstatus är inte en live-region | 4.1.3 | – | – | – |
| B13 | `window.prompt` och `window.confirm` | OPEN | Ja, cirka 40 anrop. Datum och tid via `prompt` finns i MealLogger och ProgressCenter. | 3.3.2 | Låg–medel | MealLogger, ProgressCenter, WeeklyMealPlanner med flera. CloudBackupPanel: se H. | Formulär/dialoger |
| B14 | AAA-kontrast | INFO | Ja: `color-contrast-enhanced` i de flesta vyer (navigering 5,69:1; Säkerhet & Backup 23 noder; Arkiv 12) | 1.4.6 (AAA) | Information | – | Inget krav |

## D. C1–C16 (testluckor från 8H)

| # | Lucka | Status | Kommentar |
|---|---|---|---|
| C1 | Axe på huvudvyer med navigering | COVERED | `axe-views.spec.js` (8I) |
| C2 | Plats med samtycke | COVERED | `place-cards.spec.js` (8K) |
| C3 | Mer-mappar och undersektioner i gaten | **OPEN** | Det är här fyra nya A-fynd dök upp (E) |
| C4 | Moderate-regler blockerande | PARTIAL | Bara för huvudsektionerna, inte för Mer-mapparna |
| C5 | Skymd fokus | COVERED / PARTIAL | 6 vyer i 4 lägen. Mer-mapparna ingår inte. |
| C6 | Fokus på osynliga kontroller | PARTIAL | Testet kontrollerar dolda *föräldrar*, inte en kontroll som *själv* är `sr-only`. Därför missades filväljarna (E, A-N4). |
| C7 | Live-brus och rotation vid reduced motion | COVERED | `live-motion.spec.js` (8J) |
| C8 | GlobalSearch och Redo!-bekräftelsen | COVERED | `keyboard.spec.js` (8I) |
| C9 | Falskt godkända jsdom-fällor | PARTIAL | Riktigt tangentbord för AI Coach, GlobalSearch, larmet och Redo!. Ready-, Place-, Social-, Weather- och Coach-stage-dialogerna har bara jsdom-fällor eller axe. |
| C10 | Aktivering via `click()` | COVERED | Plats (8K). Alla övriga klickbara element är riktiga knappar. |
| C11 | Skillnader mellan jsdom och Chromium | PARTIAL (strukturell) | Layoutberoende kontroller körs i Chromium. jsdom-namnen saknar CSS-effekter. |
| C12 | Webbläsarrevision och CI | OPEN | Lokalt används `/opt/pw-browsers/chromium-1194`, Playwright 1.62.1 pinnar 1234. Inget CI-flöde. |
| C13 | Axe-regler utanför gaten | PARTIAL | label-in-name körs uttryckligen. Övriga experimentella regler och AAA bara i audit. |
| C14 | Formulärfel | OPEN | Ingen automatisk kontroll av fel och annonsering (B6, B7, C14) |
| C15 | Ekonomis tabell | OPEN | Tabellen har `<caption>`, men inget test av `th`/`scope`. Den syns inte med standarddata. |
| C16 | Walkie-talkie och strömning | OPEN | Fixturbaserat. Riktigt samtal och strömmade svar testas inte. |

Summa: 7 täckta, 5 delvis och 4 öppna. C3, C12, C14, C15 och C16 räknas som
öppna; C5 är räknad som täckt för huvudvyerna.

## E. Nya fynd

### Allvar A (konkreta fel)

| # | Var | Problem | WCAG | Verifierat | Fil | Säkert för Claude |
|---|---|---|---|---|---|---|
| A-N1 | Mer → Mat, rekommendationskort | Knapparna "Dölj" ligger utanför höger kant, och sidan scrollar **286 px i sidled** redan vid 390 px bredd | 1.4.10 | axe/struktur och skärmdump | `nutritionRecommendations/RecommendationCard.jsx` (`.nutrition-actions`) | Ja (CSS) |
| A-N2 | Mer → AI Coach → Badges | Aktivt filter "Alla" har vit text på #22d3ee, **1,8:1**. Chipet "Konsekvens" och rubriken "Badges" (2,86:1) är också för ljusa. Axe `color-contrast` (serious) på 22 noder. | 1.4.3 | axe och skärmdump | `AchievementCenter.jsx` med CSS | Ja |
| A-N3 | Mer → AI Coach (Achievements, Rapporter, AI Coach) | `aria-label` på `div` utan roll: axe `aria-prohibited-attr` (serious) på 37 noder. Namnen ignoreras, så exempelvis "Nivåprogress: 20 %" och "Nästa achievement: 33 %" når inte skärmläsare. | 4.1.2, 1.3.1 | axe | `AchievementCenter.jsx`, `AICoach.jsx`, `ReportCenter.jsx`, `MonthlyReport.jsx`, `WeeklyReport.jsx`, `PredictionCenter.jsx`, `QuickActions.jsx`, `reports/ReportDrilldown.jsx`, `app/AchievementPreviewCard.jsx` | Ja (roll `progressbar`/`img`/`group` eller synlig text) |
| A-N4 | Mer → Import & Export ("Välj fil") och Säkerhet & Backup ("Importera molnbackup från JSON") | Tangentbordsfokus hamnar på `input[type=file]` som själv är `sr-only`, och den synliga knappen visar ingen fokusring | 2.4.7 | Tab-genomgång och skärmdump | `DataImportCenter.jsx:128`, `CloudBackupPanel.jsx:619` | Ja för DataImportCenter. CloudBackupPanel: bara UI (se H). |

### Allvar B (trolig förbättring)

| # | Var | Problem | WCAG |
|---|---|---|---|
| B-N1 | AI Coach → Achievements | `label-content-name-mismatch` på knapp i upplåst kort | 2.5.3 |
| B-N2 | Flera mappar (Må bra 20×22, Notis, Mat, Teckenspråk, Import & Export 22×22), Plats samtycke 20×22 | Kryssrutor under 24 px. axe godkänner via avstånd, och etiketterna är klickbara, så AA är troligen uppfyllt. Rekommendation: 24 px som i 8K. | 2.5.8 |
| B-N3 | AI Coach ("Varför detta råd?", "Varför visas detta?") | `summary` är 19 px hög. Inställningarnas "Jämför abonnemang" och "Radera konto och data" är Cursor-ägda (se H). | 2.5.8 |
| B-N4 | Mer-mapparna | Konsolen varnar för saknade i18n-nycklar `settings:*Error` (nutrition, coach, wellbeing, economy, signLanguage, animalWorld, pregnancyFirstYear). Om ett felgränsvärde visas kan råa nycklar synas. | 3.3.1 (indirekt) |

### Allvar C (testluckor)

- **C-N1:** Mer-mapparna (17) och Tillgänglighet-undersektionerna ingår varken i axe-gaten, `focus-visibility` eller `label-in-name`. Detta är C3, med konkreta fynd.
- **C-N2:** `focus-visibility` och `hidden-controls` flaggar inte en fokuserad kontroll som *själv* är `sr-only` eller urklippt (A-N4).
- **C-N3:** Väderdetaljen (Weather day) och Coach stage går inte att öppna i testmiljön utan väderkälla. De behöver en fixtur eller manuell test.

## F. Automatiskt verifierat (Chromium och Vitest)

- **Sviten:** `test:a11y` 487/487, `test:a11y:e2e` 107/107, och hela Vitest-sviten
  vid 8L med 96 kända fel och 4376 godkända.
- **Axe med alla taggar** (AA, best-practice, experimental och AAA som
  information) på 7 huvudvyer, Plats med samtycke, Notis, 17 Mer-mappar och 8
  Tillgänglighet-undersektioner. AA-resultat i E.
- **Tangentbord** (Tab, Shift+Tab, Enter, Space och Escape via sviten):
  - Fokusordning, synlig fokus, skymd fokus och dolda fokusmål i 6 vyer i 4
    lägen, plus alla 17 Mer-mappar i normalläge. Två fynd i mapparna: A-N4.
  - Textfälten i "65+", Inkasso och Kronofogden visar fokus (outline 3px).
- **Reflow och textstorlek:**
  - 200 %, 320 px och stor text: ingen sidledsscroll i huvudvyerna.
  - Mat har 286 px sidledsscroll redan i normalläge (A-N1).
  - B8 klipper vid extra stor text.
- **Reduced motion:** OS-inställningen och appens inställning, även när den
  ändras under körning, plus ingen live-rotation (sviten).
- **Högkontrast:** tokens och fokus (`high-contrast.spec.js`), samt navigeringen
  i högkontrast.
- **Forced colors (emulering):**
  - `matchMedia('(forced-colors: active)')` är sant.
  - Fokusringar med outline finns kvar, även Plats-kortens ring (2 px).
  - Aktiv navigeringslänk skiljs bara med bakgrund (B11).
- **Tillgänglighetsträdet:** headeråtgärderna på Hem exponeras inte som knappar
  när de är dolda, och Plats-rubrikerna finns. Live-regioner inventerade: på
  Hem finns en enda "Online" och en tom Live-status.

## G. Kräver fortfarande manuell test

- **Skärmläsare:**
  - VoiceOver på iOS och macOS.
  - TalkBack.
  - NVDA och JAWS.
  - Kontrollera uppläsningsordning, live-regioner (Live-status, larm, walkie,
    Redo!-status, AI Coach-chatten), rubrik- och landmärkesnavigering, rotorn,
    samt att `inert`-headern inte hörs.
- **Röststyrning:**
  - iOS Röststyrning, Voice Access och Dragon.
  - Kontrollera etiketter i CSS-versaler ("MÅ BRA"), Plats-kortens rubrikknappar
    och "Visa nästa feed-kort".
- **Brytarstyrning:** Plats-korten (`click()` är automatiskt verifierat), larmet
  och walkie-talkien.
- **Windows kontrastteman / forced colors på riktigt:** navigeringens aktiva
  tillstånd, `aria-pressed`-knappar och ikoner med `background-image`.
- **Riktig OS-textskalning och webbläsarzoom:** iOS Dynamic Type, Android font
  scale, 200–400 % zoom.
- **Fysisk touch:** träffytor (B5, B-N2) och walkie-talkiens håll-inne.
- **Walkie-talkie** i ett riktigt samtal mellan två enheter.
- **Väckarklocka** med låst skärm eller i bakgrunden, samt notiser och vibration.
- **Riktiga TTS-röster** per plattform och språk.
- **Taligenkänning** på andra språk än svenska (B10).
- **Klarspråk och kognitiv granskning**, särskilt Enkelt läge.

## H. Cursor-ägt och BLOCKED

- **Body Scan:** kortet på Hem heter "Öppna kroppsscanning i helskärm", vilket
  inte stämmer med den synliga texten (`label-content-name-mismatch`, serious).
  Det är det dokumenterade undantaget sedan 8G. **BLOCKED / CURSOR-OWNED.**
- **Smart Camera och Body Scan-dialogerna:** inte granskade. BLOCKED.
- **Inställningar:** `summary` "Jämför abonnemang" (billing) och "Radera konto
  och data" (account deletion) är 19 px höga. Det gäller träffytor.
  **CURSOR-OWNED.**
- **CloudBackupPanel (Säkerhet & Backup):** den dolda filväljaren (A-N4) och
  `window.confirm` (B13). UI-fixen är ren tillgänglighet, men flödet för
  molnbackup och återställning är Supabase-nära. Samordna med Cursor före
  ändring.

## I. Rekommenderad sprintordning (efter användarpåverkan och risk)

1. **A11Y-8N: dolt fokus och Mer-mappar i gaten.** A-N4 (osynligt fokus på
   filväljare), C-N1/C3 (Mer-mappar i axe och fokus), C-N2 (kontrollen själv
   dold). Tangentbordsanvändare kan tappa bort fokus helt, och
   testutvidgningen fångar resten av mapparna.
2. **A11Y-8O: AI Coach-mappens semantik och kontrast.** A-N3 (37 osynliga namn
   och progressvärden för skärmläsare), A-N2 (kontrast 1,8:1), B-N1. Stor
   informationsförlust för skärmläsaranvändare, låg risk.
3. **A11Y-8P: reflow i Mat.** A-N1 (286 px sidledsscroll vid normal
   mobilbredd). Påverkar alla, särskilt zoom- och förstoringsanvändare. Liten
   CSS-fix.
4. **A11Y-8Q: status- och formulärmeddelanden.** B7 (väderstatus), B6 (tomt
   fält), B4 (GlobalSearch-antal och mönster), C14. Skärmläsaranvändare missar
   resultat och fel.
5. **A11Y-8R: stor text och träffytor.** B8 (klippt text vid stor text), B5
   (14 px knappar), B-N2 (kryssrutor 24 px).
6. **A11Y-8S: forced colors.** B11, efter manuell test i Windows kontrastteman.
7. **Senare eller kräver beslut:**
   - B10: språk, med produktbeslut om taligenkänningen.
   - B13: ersätt `prompt` och `confirm` med dialoger.
   - B2 och B3: struktur.
   - B-N4: i18n-nycklar.
   - C12: CI med pinnad Chromium.
   - C15 och C16.
