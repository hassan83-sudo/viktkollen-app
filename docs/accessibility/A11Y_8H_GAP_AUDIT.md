# A11Y-8H: Djup gap-audit av tillgängligheten

Granskningen är read-only. Ingen produktionskod har ändrats, och de tillfälliga
auditskripten har tagits bort. Underlaget är `claude/parallel-1` på `b353a06`,
som bygger på A11Y-8A till 8G.

## Metod

- **Chromium (Playwright) på den körande appen**, med falsk inloggning och utan
  backend:
  - Full axe-core 4.13 med WCAG 2.0–2.2 A/AA, best-practice, experimental och
    AAA (som information). Skannat: alla sex huvudsektioner, Notis, alla 17
    Mer-mappar, de åtta undersektionerna i Tillgänglighet och de nio
    Plats-dialogerna. Plats skannades både med och utan samtycke.
  - Tab-genomgång av varje sektion. Fokusindikator, synlighet via
    `elementFromPoint`, skymning av den fasta bottennavigeringen och
    skärmdumpar.
  - Live-regioner: MutationObserver i 5–22 s per vy.
  - Reflow vid 320 px, textavstånd enligt WCAG 1.4.12 (injicerad CSS), extra
    stor text och större kontroller.
  - Riktade flöden: GlobalSearch, bekräftelsen i "Jag glömde något",
    AI Coach-chatten efter ett skickat meddelande, "Koppla väder" och appens
    inställning "Minska rörelse".
- **Statisk kodgranskning:** klickbara element som inte är knappar, `tabIndex`,
  `autoFocus`, `outline`, live-regioner, native `prompt`/`confirm`,
  dialogsemantik, `lang`, `autocomplete` och forced-colors.
- **Startläge:**
  - `test:a11y`: 470/470.
  - `test:a11y:e2e`: 48/48.
  - Full Vitest: 96 kända fel och 4359 godkända, identiskt med baslinjen.

Klassificering:

- **A** = konkret fel.
- **B** = trolig förbättring, behöver verifieras.
- **C** = testlucka.
- **D** = kräver manuell test.
- **BLOCKED** = ägs av Cursor eller kräver ett produktbeslut.

## Det som fungerar

- **Klickbara element:** alla 658 är riktiga `<button>`, `<a>` eller
  `<input>`. Inga klickbara `div` eller `span`, inga positiva `tabIndex`,
  ingen `autoFocus` och ingen `outline: none`.
- **Rubriker och landmärken:** ett synligt `main`, en h1 per huvudsektion och
  inga hopp i rubriknivåer i huvudsektionerna. Navigeringen, mapparna och
  Hem-korten uppfyller label-in-name (8G).
- **Reflow och textavstånd:** ingen sidledsscroll vid 320 px, och inget
  innehåll klipps med textavstånd enligt 1.4.12 eller med extra stor text.
- **Plats-dialogerna:** alla nio ger 0 axe-fynd, stänger med Escape och
  återför fokus till kortet.
- **Språk och chatt:** `lang` och `dir` följer valt språk. AI Coach-chatten
  (`chat-thread`, `aria-live="polite"`) ger 0 axe-fynd efter ett svar.

## A: konkreta fel

| # | Komponent / fil | Användarproblem | WCAG | Verifierat | Rekommenderad lösning | Regressionsrisk | Säkert för Claude |
|---|---|---|---|---|---|---|---|
| A1 | Bottennavigering, aktiv länk i **Redo!** och **Plats** (`App.css` 17196 ff. + `accessibility.css`) | Etiketten #cbd5e1 på #7c3aed ger 3,83:1 (9 px, fet) | 1.4.3 | axe `color-contrast` (serious) i Chromium, bara i Redo! och Plats | Vit text eller en mörkare bakgrund för aktiv länk även i Redo!- och Plats-varianterna. En CSS-regel i `accessibility.css`. | Låg | Ja |
| A2 | Hem, `.overview-header-actions.sr-only` (`OverviewDashboard.jsx` ca 1181–1210): "Visa smarta notiser" och "Lägg till profilbild" | Tangentbordsfokus hamnar på två visuellt dolda knappar och syns inte | 2.4.7, 2.4.11 | Tab-genomgång och skärmdump: ingen synlig fokus | Visa dem vid fokus (som skip-länken) eller ta dem ur tabbordningen, beroende på om de dubblerar synliga kontroller | Medel | Ja, efter beslut om vilken lösning |
| A3 | Scrollcontainern och den fasta `.bottom-nav` | Kontrollen med fokus hamnar bakom navigeringen: Mer "Arkiv & Historik" 0 % synlig, "Teckenspråk" 11 %, "Kronofogden" 29 %; Min resa "Rapporter" 0 %, "Coach" 39 %; Redo!-plattor 78 %; Stället 93 % | 2.4.11 (AA) | Tab med reduced motion, `elementFromPoint`, skärmdumpar | `scroll-padding-bottom` (navigeringens höjd + marginal) på scrollcontainern | Låg–medel | Ja |
| A4 | Live-kortet på Hem, `SmartFeedCard` (`OverviewDashboard.jsx:252`, `article aria-live="polite"`) | Kortet roterar var 10:e sekund, och varje rotation läses upp av skärmläsare, oavbrutet | 2.2.2, 4.1.3 | MutationObserver 22 s: nya uppläsningar varje rotation | Tysta regionen (`aria-live="off"`) under automatisk rotation och annonsera bara vid manuell bläddring (APG carousel) | Låg | Ja |
| A5 | Samma kort, `usePrefersReducedMotion` (`OverviewDashboard.jsx:73`) | Appens egen "Minska rörelse" respekteras inte, bara OS-inställningen, så kortet roterar ändå | 2.2.2, 2.3.3 | Appinställningen på och OS av: kortet bytte innehåll inom 12 s | Använd samma källa som 8B (`prefersReducedAccessibilityMotion` / `data-a11y-reduced-motion`) | Låg | Ja |
| A6 | `GlobalSearch.jsx` (Mer → Inställningar, Ctrl+K) | `aria-modal="true"` men ingen fokusfälla: Tab lämnar dialogen efter 27 tryck (18 tabbstopp). Bakgrunden är inte `inert`, och Escape fungerar bara i sökfältet | 2.4.3, 4.1.2 | Riktigt tangentbord i Chromium | Använd `useDialogA11y` från 8C (fälla, inert, Escape, fokusretur). Behåll Ctrl+K. | Låg–medel | Ja |
| A7 | `ForgotSomethingCard.jsx` (Redo! → "Jag glömde något") | Bekräftelsen ("Menar du …? Ja/Nej") har `role="dialog"` utan `aria-modal`. Fokus flyttas inte dit och den annonseras inte. Efter "Ja" hamnar fokus på `<body>` | 4.1.3, 2.4.3, 4.1.2 | Riktigt tangentbord i Chromium | Antingen `ModalDialog` (alertdialog) med fokus på "Ja", eller en inline-region med `role="status"` och fokus på första knappen. Fokus tillbaka till fältet efter svar. | Låg | Ja |
| A8 | Plats-korten (`PlaceSection.jsx` 634–677): `<article role="button" tabIndex={0}>` med bara `onPointerUp` och `onKeyDown` | a) Ett rent `click()`, som röststyrning, brytarstyrning och vissa skärmläsare skickar, öppnar inte kortet. b) Batterisnålt-kortet har en kryssruta inuti knappen. c) Kryssrutan är 20×22 px. d) Rubriken h3 i knappen förlorar sin semantik. | 4.1.2, 2.5.8, 1.3.1, 2.1.1 | axe med samtycke: `nested-interactive` (serious), `target-size` (serious), `aria-allowed-role`; `click()` öppnade 0 dialoger | Lägg öppningen på en riktig `<button>` (till exempel rubriken som knapp eller en "Öppna"-knapp), behåll `article` och flytta kryssrutan utanför knappen | Medel (många befintliga PlaceSection-tester fallerar redan, så regressioner syns sämre) | Ja, bara UI och inte backend |

## B: trolig förbättring eller behöver verifieras

| # | Komponent | Problem | WCAG | Verifierat | Förslag | Säkert |
|---|---|---|---|---|---|---|
| B1 | Mer → AI Coach-mappen | Saknar h1 (`page-has-heading-one`), så fokus vid mappbyte (8E) faller tillbaka till h2 eller behållaren | 1.3.1, 2.4.6 | axe (moderate) | h1 med mappens namn | Ja |
| B2 | Mer → Mat | Rubriken hoppar från h1 till h3 (`#nutrition-action-plan-title`) | 1.3.1 | axe `heading-order` | Justera nivån | Ja |
| B3 | Mer → Ekonomi | `landmark-unique` på `#app-section-economy` | 1.3.1 | axe (moderate) | Unikt namn eller onamngiven wrapper | Ja |
| B4 | GlobalSearch | Antalet resultat annonseras inte, och alternativen är både Tab-stopp och `aria-activedescendant` (blandade mönster) | 4.1.3, 4.1.2 | Chromium | Status med antal träffar och ett konsekvent listbox-mönster | Ja |
| B5 | Hem: "Visa fler råd" (148×14) och "Visa alla" (56×14) | 14 px höga knappar. axe godkänner dem via avståndsundantaget, men de är svåra att träffa | 2.5.8, 2.5.5 | Mätning | Osynlig träffyta på 44 px (samma teknik som i 8E) | Ja |
| B6 | Redo! "Lägg till sak" | Tomt fält ger ingen återkoppling, varken fel eller `aria-invalid` | 3.3.1 | Chromium | Kort felmeddelande kopplat via `aria-describedby` | Ja |
| B7 | Hem "Koppla väder" | Ingen synlig eller annonserad status när anslutningen misslyckas (nekad plats i testmiljön) | 4.1.3 | Chromium (behörigheten nekad) | Statusmeddelande. Verifiera med riktig behörighet (D). | Ja |
| B8 | Redo!-infoplattorna (`.ready-info-tile-copy`) | `nowrap` med ellips kan klippa längre text vid stor text. Inte klippt i dag. | 1.4.4, 1.4.12 | Mätning | Tillåt radbrytning | Ja |
| B9 | AI Coach, `scrollChatToBottom('smooth')` (`App.jsx` 1648) | Ett uttryckligt `behavior: 'smooth'` går före CSS, så reduced motion ignoreras | 2.3.3 (AAA) | Kod | Använd `getAccessibilityScrollBehavior` | Ja |
| B10 | Plats: Trygghetslarm-kortets rubrik och text, `PlaceVoiceCallPanel` | Hårdkodad svenska läses med fel språk i andra språklägen. Taligenkänningen är hårdkodad till `sv-SE` (`voiceConversationController.js:331`). | 3.1.2 | Kod | i18n och språk från valt språk | Delvis: i18n-strängar ja, taligenkänning efter beslut |
| B11 | Hela appen | Inga regler för `forced-colors` (0 träffar). Tillstånd som bara visas med bakgrund (aktiv navigering, `aria-pressed`) kan försvinna i Windows kontrastteman. | 1.4.1, 1.4.11 | Kod | Verifiera manuellt (D4) och lägg vid behov till `@media (forced-colors: active)`-regler | Ja |
| B12 | Hem | Två statusregioner säger "Online" (`pwa-network-pill` och Appstatus), så nätbyten läses upp två gånger | 4.1.3 | Inventering | Bara en av dem ska vara live | Ja |
| B13 | Native `window.prompt` och `window.confirm` (MealLogger datum/tid, ProgressPhotos, RecipeManager, MealQuickAdd, AccessibilityHub; CloudBackupPanel, se BLOCKED) | Tillgängliga men utan format eller validering. Prompt för datum och tid är svår att använda. | 3.3.2 | Kod | `ModalDialog`-formulär på sikt | Ja, utom CloudBackupPanel |
| B14 | AAA-kontrast (information) | Aktiv navigering 5,69:1, statusetiketter i Säkerhet & Backup och Arkiv 6,14:1, Mat-rubrikerna 6,52:1 | 1.4.6 (AAA) | axe `color-contrast-enhanced` | Inget krav, men kan tas i högkontrastläget | Ja |

## C: testluckor

| # | Lucka | Konsekvens | Förslag |
|---|---|---|---|
| C1 | `axe-views.spec.js` skannar bara Hem, Mer och Tillgänglighet med synlig navigering | A1 missades | Skanna alla sex sektioner och Notis med synlig navigering |
| C2 | Plats skannas bara utan samtycke, eller med en dialog öppen (då är bakgrunden inert) | A8 missades | Lägg till en skanning med samtycke och utan dialog |
| C3 | De 17 Mer-mapparna och de åtta undersektionerna i Tillgänglighet ingår inte i axe-gaten | B1–B3 hittades bara här | Loopa mapparna i gaten |
| C4 | Moderate-regler (`heading-order`, `landmark-unique`, `page-has-heading-one`) blockerar inte | Strukturfel kan komma in obemärkt | Gör dem blockerande för appvyer (inga undantag behövs i dag, utom B1–B3) |
| C5 | Inget test för skymd fokus (2.4.11) | A3 | Tab-genomgång med `elementFromPoint` mot bottennavigeringen |
| C6 | Inget test för att den fokuserade kontrollen syns | A2 | Kontrollera att fokus aldrig ligger i `.sr-only`, har storlek noll eller opacitet 0 |
| C7 | Reduced motion-testet mäter bara CSS-animationer; ingen kontroll av JS-rotation eller brus i live-regioner | A4, A5 | Mät live-mutationer över tid, och rotation när appens inställning är på |
| C8 | GlobalSearch och Redo!-bekräftelsen saknas i dialogtesterna | A6, A7 | Lägg till dem i `keyboard.spec.js` |
| C9 | **Risk för falskt positivt resultat:** 8C:s jsdom-dialogtester (`dialogIntegration.test.jsx`) skickar `fireEvent.keyDown(Tab)`, men jsdom flyttar aldrig fokus självt | "Fokus stannar i dialogen" skulle gå igenom även utan fokusfälla. Bara wrap-kontrollerna (sista → första) bevisar fällan. | Kör alla dialoger med riktigt tangentbord i Playwright (i dag bara AI Coach och larmet) |
| C10 | Aktivering via `click()` testas inte. Playwrights `click()` använder pekarhändelser. | A8 | Lägg till `element.click()` för anpassade kontroller |
| C11 | Skillnader mellan jsdom och Chromium | jsdom har ingen layout: ingen kontrast, målstorlek, fokussynlighet eller overflow. Namn beräknas utan CSS (`text-transform`, `::after`) och block slås ihop utan mellanslag (se 8G). | Håll layoutberoende kontroller i Playwright |
| C12 | Chromium-versionen skiljer | Lokalt används revision 1194, Playwright pinnar 1234. Kontextoptionen för reduced motion ignoreras i 1194 (lösning: `emulateMedia`). | CI bör köra den pinnade revisionen |
| C13 | axe-regler som inte ingår i gaten | Experimentella regler utöver label-in-name, samt AAA. Auditkörningen med dem gav bara AAA-kontrast. | Behåll dem som periodisk audit |
| C14 | Formulärfel testas inte | Kopplingen `aria-invalid`/`aria-describedby` och annonsering i Redo!, Social och Plats saknar tester | Lägg till vid fixarna (B6) |
| C15 | Ekonomis tabell (den enda `<table>`) testas inte | `th`, `scope` och `caption` är okontrollerade (tabellen syns inte med standarddata) | Testa med data |
| C16 | Walkie-talkien testas via en fixtur, och AI Coach bara med ett svar som inte strömmas | Beteendet vid riktiga samtal och strömning är okänt | Manuellt (D7) plus ett test när strömning finns |

## D: kräver manuell testning

- **D1 Skärmläsare** (VoiceOver iOS och macOS, TalkBack, NVDA/JAWS): uppläsningsordning, live-regioner (AI Coach-chatten, larmets alertdialog, walkie-status, Live-kortet), rubrik- och landmärkesnavigering, rotor och gester.
- **D2 Röststyrning** (iOS Röststyrning, Android Voice Access, Dragon): label-in-name med CSS-versaler ("MÅ BRA") och "›", samt Plats-korten (A8).
- **D3 Brytarstyrning:** Plats-korten, walkie-talkien och larmet.
- **D4 Windows kontrastteman och forced colors,** samt systemteman på Android och iOS (B11).
- **D5 Riktig webbläsarzoom 200–400 % och OS-textstorlek** (Dynamic Type, Android font scale). Auditen emulerar bara viewport och appens textstorlek.
- **D6 Touch på riktiga enheter:** träffytor, gester och walkie-talkiens håll-inne.
- **D7 Walkie-talkie i ett riktigt samtal mellan två enheter:** ljud och statusuppläsning.
- **D8 Väckarklocka med låst skärm eller i bakgrunden,** notiser och vibration på riktig enhet.
- **D9 Röster och språk för talsyntes och taligenkänning** per plattform (B10).
- **D10 Klarspråk och kognitiv granskning** av texterna, särskilt i Enkelt läge.

## BLOCKED: Cursor-ägt eller kräver produktbeslut

- **Body Scan:** kroppsscanningskortet på Hem har namnet "Öppna kroppsscanning i helskärm", som skiljer sig från den synliga texten. Det är det dokumenterade undantaget från 8G.
- **Smart Camera och Body Scan-dialogerna:** observerade, inte granskade eller ändrade.
- **CloudBackupPanel:** `window.confirm` i molnbackupen (Supabase-flödet) kräver samordning med Cursor.
- **Billing, abonnemang, betalningar, kvoter och kontoradering:** inte granskade.
- **Plats-backend:** "Place sharing sync failed" i konsolen utan backend är inget A11Y-fynd.
- **Produktbeslut:**
  - A2: ska de dolda Hem-knapparna synas vid fokus eller tas bort ur tabbordningen?
  - A4/A5: ska Live-kortet rotera automatiskt som standard?
  - B10: ska taligenkänningen följa appens språk?

## Rekommenderad nästa sprint (ingen implementation ännu)

Grupperna nedan är ordnade efter låg risk och stort värde. Varje grupp innehåller sina tester.

1. **Kontrast och struktur** (A1, B1, B2, B3; tester C1, C3, C4). Mest CSS och rubriknivåer, låg risk.
2. **Fokus och synlighet** (A2 efter beslut, A3, B5; tester C5, C6). CSS (`scroll-padding`) och en liten JSX-ändring, låg till medel risk.
3. **Dialoger** (A6, A7, B4; tester C8, C9). Återanvänder `useDialogA11y` och `ModalDialog` från 8C, låg risk.
4. **Dynamiska meddelanden och rörelse** (A4, A5, B9, B12; test C7). `OverviewDashboard` och chattscrollen i `App.jsx`, låg risk.
5. **Plats-kortens semantik** (A8, B10-strängar; tester C2, C10). Medelrisk, eftersom `PlaceSection.test.jsx` redan fallerar. Kör en egen sprint.

Senare: B6, B7, B8, B11 (forced colors efter D4), B13 och B14.
