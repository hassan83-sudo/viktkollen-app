# A11Y-8Y: Full checkpoint och gap-audit efter 8X

Start: `936f17e` (efter 8U, 8V, 8W och 8X1–8X6). `origin/main` står på
`462c945`. Det har kommit 18 nya Cursor-commits sedan merge-basen `2aa57d1`,
alla om billing. Det är bara noterat, inget är mergat.

**Audit utan ändringar:** ingen produktionskod är ändrad. En tillfällig probe
(`tests/a11y/_audit8y_probe.spec.js`) togs bort före commit.

## 1. Checkpoint

| Körning | Resultat |
|---|---|
| `npm run test:a11y` | **502 godkända, 0 fel** (36 filer) |
| Hela `npm run test:a11y:e2e` | **227 godkända, 0 fel, 0 flaky, 0 hoppade över** (15,9 min) |
| Hela Vitest (`vitest run`) | **4 391 godkända och 96 fel** av 4 487 (952 filer). Alla 96 fel är de kända i baslinjen, och **0 är nya**. Inga fel i baslinjen har börjat gå igenom. |
| `i18n:check` | OK |
| `i18n:hardcoded` | 0 signaler |
| build | OK |
| `git diff --check` | OK |
| lint (`eslint .`) | 51 problem (42 fel, 9 varningar), samma som baslinjen |

Före 8U och 8V var E2E 196. Ökningen till 227 är de permanenta testerna från
8U, 8V, 8W och 8X1–8X6.

## 2. Verifiering av 8W och 8X1–8X6

- **GlobalSearch (8W):** `global-search.spec.js` och `keyboard.spec.js` (3
  GlobalSearch-tester) är gröna i hela körningen. Det täcker:
  - combobox och listbox;
  - pilar, Enter, Escape och fokusretur;
  - status för antal träffar och för 0 träffar;
  - att inga alternativ är Tab-stopp.
- **Webbläsardialoger (8X1–8X6):**
  - Claude-ägda `window.prompt`: **0**.
  - Claude-ägda `window.confirm`: **0**.
  - Molnbackup: exakt **4** `window.confirm`.
  - Zero-gaterna `remainingPrompts.test.jsx` och `confirmDialog.test.jsx` är
    gröna.
  - PWA:ns `promptEvent.prompt()` räknas inte, eftersom det inte är
    `window.prompt`.
- **Dialogtester:** alla gröna i hela körningen: `date-time-dialogs`,
  `remaining-prompts`, `confirm-dialogs`, `food-confirm-dialogs`,
  `meal-planner-confirm-dialogs` och `final-confirm-dialogs`. Detsamma gäller
  jsdom-testerna för DateTimeDialog, ConfirmDialog, de sista dialogerna och
  AccessibilityHub.
- **8X-dialogerna i specialfall** (probe på ConfirmDialog):

  | Läge | Resultat |
  |---|---|
  | 320 px, extra stor text och stora kontroller | axe 0, ryms, knappar 172×44 och 106×44, ingen sidledsscroll |
  | Appens högkontrast | axe 0 (även kontrast), ryms |
  | Forced colors | axe 0, kant 1px CanvasText, ryms |

## 3. Status för tidigare fynd

### A

| ID | Status | Bevis (8Y) |
|---|---|---|
| A1–A8 | FIXED | Respektive spec är grön i hela körningen |
| A-N1 (Mat reflow) | FIXED | `mat-reflow` och Mer-gaten gröna |
| A-N2 (AI Coach, kontrast) | FIXED | axe 0 |
| A-N3 (namngivna `generic`, AI Coach) | FIXED | Probe: 0 namngivna `generic` i alla 22 vyer |
| A-N4 (dold filväljare som Tab-stopp) | FIXED utom Molnbackup, som är **BLOCKED — CURSOR-OWNED** | `CloudBackupPanel` "Importera molnbackup från JSON-fil" har fortfarande `tabIndex=0` och `sr-only` |

### B

| ID | Status | Bevis (8Y) |
|---|---|---|
| B2 (Mat rubrikordning) | **FIXED** (8V) | h1 → h2 → h3; `semantics-8v` grön; 0 hopp i alla 22 vyer |
| B3 (Ekonomi, landmärken) | **FIXED** (8V) | En region "Ekonomi"; axe 0 |
| B4 (GlobalSearch) | **FIXED** (8W) | Se 2 |
| B10 (hårdkodad svenska / `sv-SE`) | **OPEN** | se nedan |
| B11 (forced colors) | FIXED automatiskt, **MANUAL ONLY** återstår | `forced-colors` grön |
| B12 (dubbla "Online") | NOT REPRODUCIBLE | oförändrat |
| B13 (`prompt`/`confirm`) | **FIXED** för Claude (9 `prompt` och 26 `confirm`); **BLOCKED — CURSOR-OWNED** för 4 `confirm` i Molnbackup | zero-gate |
| B14 (AAA) | INFORMATIONAL | – |
| B-N1 (label in name) | FIXED i Claude-området. Body Scan är **BLOCKED — CURSOR-OWNED**. | Probe: enda fyndet är Hem `.overview-primary-action-hit` ("Öppna kroppsscanning i helskärm") |
| B-N2 (kryssrutor) | FIXED | Inputs på 20–22 px har en `label` som träffyta på minst 24 px (8R); axe `target-size` 0 |
| B-N3 (`summary` 19 px) | FIXED för AI Coach. Inställningar är **BLOCKED — CURSOR-OWNED**. | Probe: "Jämför abonnemang" och "Radera konto och data" är fortfarande 336×19 |
| B-N4 (`settings:*Error`) | **OPEN** | Konsolen varnar fortfarande (`settings:nutritionError`, `coachError`, `wellbeingError`, `economyError` …). Nycklarna ligger under `journey`, men `MoreSection` läser `settings`. |

**B10 i detalj (OPEN):**
- `voiceConversationController.js:331` har `recognition.lang = 'sv-SE'`, så
  taligenkänningen följer inte appens språk.
- `PlaceSection.jsx` har hårdkodad svenska i trygghetslarmets val,
  incheckningsvalen, "Stäng notis" och "Platsdelning aktiv".
- `PlaceVoiceCallPanel.jsx:32` har `aria-label` "Prata med …" hårdkodat, plus
  övrig text.
- Dialogtexterna från 8X4–8X6 följer respektive fils mönster. I filer som
  redan har hårdkodad svenska (RecipeManager, MealQuickAdd,
  DietaryPreferencesPanel, WeeklyMealPlanner, AICoach, ProgressPhotos,
  GoalsHabitsPanel, CoachMemoryReview och ManualAcceptanceRunner) är de också
  hårdkodade. Översättningsskulden är alltså densamma, inte ny.
- **Cursor:** `bodyAnalysisVideoScan.js:590` har talsyntes med `sv-SE`
  (Body Scan).

### B-8T

| ID | Status | Bevis (8Y) |
|---|---|---|
| B-8T-N1 fokus till `<body>` | FIXED (8U) | `quick-fixes-8u` grön |
| B-8T-N2 Må bra reflow | FIXED (8U) | Mer-gaten, reflow 390, 320 och 320 med extra stor text |
| B-8T-N3 klippt råd på Hem | FIXED (8U) | `quick-fixes-8u` |
| B-8T-N4 65+ tyst formulär | FIXED (8U) | `quick-fixes-8u` |
| B-8T-N5 namngivna `generic` | FIXED (8V) | Probe: 0 i 22 vyer; `semantics-8v` |
| B-8T-N6 stora live-regioner | FIXED (8V) | Probe: ingen live-region över 200 tecken och 0 nästlade i 22 vyer |
| B-8T-N7 dubbla h1 | FIXED (8V) | Probe: exakt en h1 i alla 22 vyer |
| B-8T-N8 "Ring 112" | FIXED (8U) | `quick-fixes-8u` |

### C

| ID | Status | Bevis (8Y) |
|---|---|---|
| C4 moderate blockerande | **PARTIAL** | 5 huvudvyer och 9 av 17 Mer-mappar blockerar på moderate. Probe: **alla 22 vyer är rena på moderate idag**, så gaten kan utökas utan fix. |
| C5 skymd fokus | PARTIAL | Huvudvyerna i fyra lägen. Mer-mapparna kontrolleras för dolt fokus och reflow, men inte för skymd fokus vid 320 px med extra stor text. |
| C9 jsdom-fällor | **PARTIAL** | Social och Place har fortfarande inget riktigt tangentbordstest för flikar och kortval. Det är precis så A-8Y-N1 kunde passera. |
| C11 jsdom kontra Chromium | PARTIAL (strukturell) | oförändrat |
| C12 CI och webbläsarrevision | **OPEN** | ingen `.github/workflows` |
| C13 axe-regler utanför gaten | PARTIAL | `label-content-name-mismatch` körs bara i audit och vissa specar (Body Scan är känt) |
| C14 formulärfel | **PARTIAL** | Gatade: Redo, väder, 65+, DateTimeDialog (8X1) och import. Övriga formulär (Ekonomi, mål, kroppsmått, recept, måltider) har inget test för fel och status. |
| C15 Ekonomis tabell | **OPEN** | `sr-only`-tabellen (`EconomyCenter.jsx:473`) har `caption` och radrubriker men inga kolumnrubriker för belopp och procent, och inget test |
| C16 walkie-talkie | **MANUAL ONLY** | Bara fixturtest; kräver två riktiga enheter |
| C-N3 väderdialogen och Coach stage | **PARTIAL** | Väderstatusen är gatad, men dialogen "Visa hela dagen" har inget permanent test. Coach stage är inte verifierad. |

## 4. Nya fynd (8Y)

| ID | Allvar | Fynd | Bevis | WCAG | Ägare |
|---|---|---|---|---|---|
| **A-8Y-N1** | **A** | **Ställets flikar går inte att nå med tangentbord.** `SocialRoom.jsx:140–153` har `role="tablist"` med roving tabindex (inaktiva flikar `tabIndex=-1`) men ingen hantering av piltangenter. | Chromium: bara "Stället" är ett Tab-stopp (80 Tab). Pil höger, pil vänster, End och Home flyttar inte fokus. "Chatt", "Titta", "Tavlan" och "Spel" går bara att öppna med mus eller touch. | 2.1.1 | Claude |
| **B-8Y-N1** | B | **Ekonomis flikar** (`EconomyCenter.jsx:236–249`) har ett ofullständigt flikmönster. Det är `role="tab"` utan `aria-controls` och utan `tabpanel`, alla 6 är Tab-stopp, och piltangenterna gör ingenting. Allt går att nå, men mönstret blandas som i B4. | Probe: 6 flikar med `tabIndex=0`, `controls=null`, 0 `tabpanel` | 4.1.2, 1.3.1 | Claude |
| C-8Y-N1 | C | I appens högkontrastläge förstärks inte kanten på 8X-dialogerna (`rgba(120,150,255,0.28)`). Dialogen avgränsas ändå av bakgrundsdämpningen, och axe ger 0. | Probe | 1.4.11 (best practice) | Claude |
| C-8Y-N2 | C | Kopierad vikt: DateTimeDialog (8X1) frågar efter tid, men appens dagliga vikt lagrar tiden som 12:00. Tiden användaren anger används alltså inte. Det var likadant med `prompt`, och det beror på datamodellen. | 8X1 | 3.3.2 (vilseledande fält) | Claude, produktbeslut |
| C-8Y-N3 | C | Tabbmönster har inget permanent tangentbordstest. Det är en testlucka som gjorde att A-8Y-N1 kunde passera. | – | – | Claude |

**Inga andra nya fynd** i scannen av de 22 vyerna (5 huvudvyer och 17
Mer-mappar):
- inga dubbla id;
- 0 dolda Tab-stopp i Claude-området;
- exakt en h1 och 0 hopp i rubrikordningen;
- 0 namngivna `generic`;
- inga stora eller nästlade live-regioner;
- axe critical, serious och moderate: 0 i Claude-området;
- reflow 0 px i alla huvudvyer vid 320 px med extra stor text (Mer ingår i
  gaten);
- reducerad rörelse och forced colors: specarna är gröna.

## 5. Cursor-ägda (BLOCKED — CURSOR-OWNED)

Inget av detta är ändrat på `origin/main` sedan merge-basen. Cursors 18
commits gäller billing.

| Område | Aktuell status (8Y) | Minimal åtgärd |
|---|---|---|
| **Molnbackup** (`CloudBackupPanel.jsx`) | **4 `window.confirm`** (återställ, radera, importera, ångra). Den dolda filväljaren är fortfarande ett Tab-stopp (`tabIndex=0`, `sr-only`; A-N4). | `ConfirmDialog` (finns sedan 8X3). Filväljaren: `tabIndex={-1}`, `aria-hidden` och en synlig knapp (8N-mönstret). Därefter sänks gaten i `confirmDialog.test.jsx` till 0. |
| **Inställningar, billing och kontoradering** | `summary` "Jämför abonnemang" och "Radera konto och data" är 336×19 (B-N3). `PlanComparison` har `id="plan-compare-title"` på både `summary` och `h3`, men bara ett av dem renderas åt gången, så det är inget dubbelt id i DOM:en. | `min-height: 24px` |
| **Smart Camera** (AI Ögat från Redo) | **Reproduceras fortfarande.** När dialogen öppnas med tangentbordet ligger fokus kvar utanför, på Hems h1. Efter Escape är den fortfarande öppen. | `ModalDialog` (initialt fokus, Escape och fokusretur) |
| **Body Scan** | Label in name: "Öppna kroppsscanning i helskärm" mot den synliga texten "Kroppsscanning Tryck på personen …" (axe serious på Hem). Talsyntes med `sv-SE` (`bodyAnalysisVideoScan.js:590`). | Namnet ska börja med den synliga texten. Talsyntesen ska följa appens språk. |

## 6. Manuell verifiering

| Prioritet | Test | Vad |
|---|---|---|
| **HIGH** | VoiceOver iPhone | Rubriknavigering (h1/h2 efter 8V), GlobalSearch-combobox (8W), **alla nya dialoger** (`alertdialog` med beskrivning, DateTimeDialog med iOS datum- och tidsväljare, importläge som radiogrupp), statusmeddelanden, alarm, `inert` bakom dialoger |
| **HIGH** | TalkBack Android | Samma som VoiceOver, plus touch-utforskning av träffytor och Androids datumväljare |
| **HIGH** | NVDA (Chrome och Firefox) | `aria-activedescendant` i GlobalSearch, att `alertdialog` läses upp när den öppnas, statusregioner (AI Coach-status, filterstatus i Health Journey), formulärfel |
| **HIGH** | Windows kontrastteman | Nav, valda tillstånd, progress, dialoger (även 8X) i "Nattsvart" och "Öken" |
| **HIGH** | Walkie-talkie mellan två riktiga enheter | Håll-inne, status och uppläsning (C16) |
| **HIGH** | Alarm på riktig enhet | Låst skärm, bakgrund, vibration och visuellt larm |
| MEDIUM | JAWS | Stickprov: dialoger, combobox och formulär |
| MEDIUM | Riktig webbläsarzoom 200–400 % | Mer-mappar, dialoger och Ställets chipsrader |
| MEDIUM | iOS Dynamic Type och Android font scale | Samspel med appens textstorlek |
| MEDIUM | Taligenkänning på andra språk | Kan inte verifieras förrän B10 är beslutat och åtgärdat |
| MEDIUM | Röststyrning (Voice Control, Voice Access, Dragon) | Body Scan-namnet och de nya dialogknapparna ("Ta bort", "Avbryt") |
| LOW | Brytarstyrning | Plats-kort, larm och walkie |
| LOW | Touch | Ställets chipsrader och "Ring 112" |

**Borttaget:** "Pilnavigering i Ställets `tablist` (LOW)". Det är nu ett
kodfynd (A-8Y-N1), inte en manuell kontroll.

## 7. Sprintplan (inte startad)

| Sprint | Fynd | Filer och område | Omfattning | Ägare | Full regression efteråt |
|---|---|---|---|---|---|
| **8Z1: Flikar och tangentbord** | A-8Y-N1, B-8Y-N1, C-8Y-N3 (och del av C9) | `SocialRoom.jsx`, `EconomyCenter.jsx`, ny spec för flikmönstret | Liten–medel: pilar, Home och End, `tabpanel` och `aria-controls`, plus ett permanent tangentbordstest i Chromium för båda | Claude | Nej, bara riktade tester |
| **8Z2: Språk och i18n** | B-N4, B10 (Claude-delen) | `MoreSection.jsx` och `settings`-nycklar, `PlaceSection.jsx`, `PlaceVoiceCallPanel.jsx`, `voiceConversationController.js` | Medel. **Kräver produktbeslut** om taligenkänningens språk. Dialogtexterna i de hårdkodade filerna kan ingå eller vänta. | Claude | Nej, bara riktade tester |
| **8Z3: Gates och testluckor** | C4, C15, C-N3, C14 (urval), C5, C-8Y-N1 | `more-folders.spec.js` (moderate i alla 17), `EconomyCenter.jsx` (kolumnrubriker och test), test av väderdialogen, felstatus i Ekonomi, mål och kroppsmått, skymd fokus i Mer vid 320 px med extra stor text, dialogkant i högkontrast | Medel, mest tester, lite CSS och markup | Claude | **Ja**, full checkpoint efter 8Z3 |
| (8Z4: CI) | C12 | `.github/workflows` med pinnad Chromium | Liten, men kräver repo- eller ägarbeslut | Claude eller ägare | – |
| **Cursor-överlämning** | A-N4 (Molnbackup), B13 (4 `confirm`), B-N3, Smart Camera, Body Scan (B-N1, TTS) | `CloudBackupPanel`, billing och Inställningar, `SmartCameraStage`, Body Scan | Liten–medel. `ConfirmDialog` och `ModalDialog` finns att använda. | **Cursor** | Ja, i Cursors spår |
| Beslut (ingen sprint) | C-8Y-N2 | Datamodellen för daglig vikt | Produktbeslut: ta bort tidsfältet för vikt, eller spara tiden | Produkt | – |

## 8. Procentbedömning (försiktig)

**A. Kod och automatiserad tillgänglighet: cirka 85 % klart, 15 % kvar.**

Det som återstår:
- ett nytt A-fynd, flikar i Stället (litet men blockerande);
- flikmönstret i Ekonomi;
- i18n och språk (B10, B-N4), där taligenkänningen kräver beslut;
- utökade gates och tester (C4, C5, C9, C14, C15, C-N3);
- CI (C12);
- Cursors del (Molnbackup, Smart Camera, Body Scan och summaries). Den ingår
  i "kvar" men är blockerad för Claude.

**B. Hela arbetet, med manuell verifiering: cirka 65 % klart, 35 % kvar.**

Det mesta av det som återstår är verifiering med riktiga hjälpmedel och
enheter. Inget av det är gjort ännu:
- VoiceOver, TalkBack, NVDA och JAWS;
- Windows kontrastteman;
- walkie-talkie och alarm på riktiga enheter;
- zoom, Dynamic Type och röststyrning.

Till det kommer åtgärder som manuella tester sannolikt hittar.
