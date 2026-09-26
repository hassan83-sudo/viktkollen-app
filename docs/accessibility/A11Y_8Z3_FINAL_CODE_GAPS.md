# A11Y-8Z3: De sista kodluckorna och full regression

Start: `8cc8839`. `origin/main` har flyttats från `462c945` till `f4bef87`
("billing: integrate subscription lifecycle authority", Cursor). Det är bara
noterat, inget är mergat.

Fynden kommer från 8Y (`A11Y_8Y_POST_8X_FULL_AUDIT.md`), 8Z1 och 8Z2. Det här
är den sista planerade kodstädningen i Claude-området före en ny
slutbedömning. C12 (CI), C16 (manuell testning) och Cursor-ägda fynd ingår
inte.

## Sammanfattning

| Fynd | Status |
|---|---|
| **B10** Claude-delen | **FIXED IN CLAUDE SCOPE**. Kvar är bara Body Scan (`sv-SE`), som är **BLOCKED — CURSOR-OWNED**. |
| **B-8Z1-N1** Ekonomi, sidledsscroll vid 320 px | **FIXED** |
| **C15** Ekonomis tabell | **FIXED** |
| **C-N3** väderdialogen | **FIXED** |
| C4 moderate i alla Mer-mappar | **FIXED** |
| C5 skymd fokus i Mer vid 320 px med extra stor text | **FIXED**. Molnbackup är ett känt undantag, **BLOCKED — CURSOR-OWNED**. |
| C9 jsdom-fällor (flikar och kortval) | **FIXED** |
| C11 jsdom kontra Chromium | **PARTIAL (strukturell)** |
| C13 axe-regler utanför gaten | **FIXED** i Claude-området |
| C14 formulärfel | **PARTIAL**. Ekonomi, mål, recept och måltider är klara. Kroppsmått är **BLOCKED — CURSOR-OWNED** (se nedan). |
| C-8Y-N1 dialogkant i appens högkontrast | **FIXED** |

## B10: slutstatus

8Z2 lämnade fyra grupper med hårdkodad svenska i Claude-området. Alla är nu i
i18n, på svenska och engelska, och utan svensk `defaultValue`.

| Grupp | Före | Efter |
|---|---|---|
| `PlaceSection.jsx` | 16 reservtexter för fel (`error?.message \|\| '… kunde inte …'`), notiserna "{namn} kom till / lämnade {plats}", "Ansluten" och "Av" på korten, kortnamnet "Trygghetslarm", och all text i dialogerna Trygga platser, Trygghetslarm, Allt är okej, Platshistorik och Inställningar för platsdelning. Det gäller även etiketter, platshållare, statusar ("Sparar …", GPS-status) och knappar. | `place.errors.*`, `place.details.*` och `place.retention.m*`. Lagringstiderna (`placeHistoryRetentionChoices`) översätts via antal minuter, så tjänsten är oförändrad. Texter som sätts i effekter använder i18n-instansen, så att effekterna inte körs om och hämtar data igen när `t` ändras. |
| `PlaceVoiceCallPanel.jsx` | samtalsstatus ("Ansluter ljud…", "🔊 Ljud anslutet", "Ljudanslutningen misslyckades." m.fl.), felreserver, rubrik, knappar (Ring, Svara, Avvisa, Avsluta samtal, Stäng, Avbryt), "Ringer {namn}…", "{namn} ringer dig." | `place.voiceCall.*`; Stäng och Avbryt kommer från `common:actions` |
| `voiceConversationController.js` | 16 statustexter ("🎤 Lyssnar...", "🧠 Bearbetar...", mikrofonfel och så vidare) | `coach:voiceStatus.*`. Kontrollern har fått ett nytt alternativ, `translate`, som som standard använder `i18n.t`. |
| Dialogtexter från 8X4–8X6 | Rubrik, fråga och bekräftelseknapp var hårdkodade i 8 komponenter: AICoach, CoachMemoryReview, GoalsHabitsPanel, ProgressPhotos, RecipeManager, WeeklyMealPlanner (5 dialoger, konstanten `confirmCopy` är borttagen), MealQuickAdd och DietaryPreferencesPanel | ny namnrymd `confirm` (`src/i18n/confirmDialogResources.js`). Avbryt kom redan från `common:actions.cancel`. |

- **Inte ändrat: `ManualAcceptanceRunner`.** Det är ett utvecklarverktyg för
  TESTDATA som inte visas för användare.
- **BLOCKED — CURSOR-OWNED:** Body Scans talsyntes (`sv-SE` i
  `bodyAnalysisVideoScan.js:590`).
- **Verifierat i Chromium på engelska** (`gaps-8z3.spec.js`): dialogerna i
  Plats innehåller ingen svensk text. Det är samma innehåll som finns i
  `accessibilityLanguageI18n.test.js`.

**Övrig i18n-skuld, utanför B10:** B10 definierades i 8T, 8Y och 8Z2 med
listan ovan. På Plats-sidan finns även svensk text i andra komponenter, som
inte ingick i den listan och inte är ändrade:
- `PlaceLocationRequestPanel.jsx`: platsförfrågan och familjekoden;
- `SchoolCardEnhancer.js`: kortnamnet "Skola" och skolkartan;
- `FamilyMapView.jsx`, `TripSharePanel.jsx`, `RouteShareControls.jsx` och
  `SchoolMapView.jsx`.

Utanför Plats har komponenter som RecipeManager och WeeklyMealPlanner kvar sin
övriga svenska text utanför dialogerna. Talrelaterade texter i
`realtimeVoiceController.js` ingår inte heller. Premiumrösten är avstängd
(`REALTIME_VOICE_ENABLED = false`) och hänger ihop med billing. Samma fil
tolkar svenska statustexter med reguljära uttryck. `i18n:hardcoded` ger 0
prioriterade signaler.

## Ekonomi: sidledsscroll (B-8Z1-N1)

**Orsak:** textalternativet till utgiftstavlan var en `<table
className="sr-only">`. En tabell följer inte `width: 1px` och `overflow:
hidden`, så den lades ut i full bredd (314–389 px) med `position: absolute`,
och sidan scrollade. Det var bara synligt i fliken Översikt, där tavlan finns.

**Åtgärd:** `sr-only` sitter nu på en omslutande `<div>`, inte på tabellen.
Det syns inte, och layouten är densamma.

| Scrollbredd (`scrollWidth - clientWidth`), fliken Översikt | Före | Efter |
|---|---|---|
| 320 px | 25 px | **0** |
| 320 px, extra stor text och stora kontroller | 100 px | **0** |
| 390 px | 0 | **0** |
| 390 px, extra stor text och stora kontroller | 30 px | **0** |
| 1280 px (desktop) | 0 | **0** |

Alla 6 flikar ger 0 i alla fem lägen. Det kända undantaget i
`tabs-keyboard.spec.js` är borttaget, och kontrollen kräver nu exakt 0.

**Negativt bevis:** med `sr-only` på tabellen igen faller testet för 320 px
(Översikt: 77 px, förväntat 0). Det är återställt.

## C15: Ekonomis tabell

Tabellen hade `caption` och `<th>` utan `scope`, men inga kolumnrubriker.

Nu är den en riktig datatabell:
- `<caption>` "Textalternativ till utgiftstavlan";
- `<thead>` med `<th scope="col">`: Kategori, Belopp och Andel
  (`economy.wheel.columns`, på svenska och engelska);
- varje rad har `<th scope="row">` med kategorin och en cell per kolumn.

Det är riktig semantik, ingen ARIA-emulering. Chromes tillgänglighetsträd
visar tre `columnheader` och en `rowheader` per rad. Tabellen syns inte, och
omslaget är 1×1 px med `clip-path: inset(50%)`. Den visuella tavlan är
oförändrad. Axe med critical, serious och moderate ger 0.

## C-N3: väderdialogen

Det är ett permanent test i Chromium ("Visa hela dagen" på Hem). Open-Meteo
mockas med `page.route`. Produktionskoden behövde inte ändras, eftersom
beteendet redan var korrekt.
- dialogen öppnas med Enter och heter "Vädret idag" (`aria-modal`);
- fokus hamnar i dialogen och är synligt;
- bakgrunden är `inert`;
- Tab och Shift+Tab stannar i dialogen;
- Escape stänger dialogen, fokus går tillbaka till "Visa hela dagen", och
  bakgrunden är inte längre `inert`;
- "Hämtar väder…" och sedan "Väder ej anslutet" visas i en polite
  live-region när laddningen misslyckas;
- Stäng stänger också och ger tillbaka fokus;
- axe med critical, serious och moderate ger 0, både med timprognos och vid
  fel.

## C-gates

| ID | Status | Vad |
|---|---|---|
| **C4** | **FIXED** | `more-folders.spec.js` blockerar på moderate i **alla 17** mappar. Tidigare gällde det 9 av 17. |
| **C5** | **FIXED** | Nytt test per Mer-mapp: skymd fokus (2.4.11) vid 320 px med extra stor text och stora kontroller. Varje Tab-stopp ska vara i vyn, ovanför bottennavigeringen och inte täckt av något annat element. Hjälpfunktionen är flyttad oförändrad från `focus-visibility.spec.js` till `support/obscuredFocus.js`. Känt undantag med kontroll för inaktuell post: Molnbackups dolda filväljare ("Importera molnbackup från JSON-fil", täckt av importknappen). Det är A-N4, **BLOCKED — CURSOR-OWNED**. |
| **C9** | **FIXED** | Flikarna i Stället har tangentbordstest sedan 8Z1. Plats: Chromium-testet öppnar varje dialog med Enter, Tabbar till valen med synligt fokus, stänger med Escape och ger fokus tillbaka till kortet (`gaps-8z3.spec.js`, B10-testet). Aktiveringen av korten täcks redan av `place-cards.spec.js`. |
| C11 | **PARTIAL (strukturell)** | jsdom kan inte mäta layout, fokusgeometri eller verklig tangentbordsnavigering. Det ersätts av Chromium-specar, som i den här sprinten, men kan inte stängas i kod. |
| **C13** | **FIXED** i Claude-området | `label-content-name-mismatch` är märkt experimentell i axe och kördes därför bara i `label-in-name.spec.js` (huvudvyerna). Nu körs regeln även i alla 17 Mer-mappar, via nya `runAxeRules` i `support/axe.js`. Body Scan-kortet är fortfarande undantaget, **BLOCKED — CURSOR-OWNED**. |
| **C14** | **PARTIAL** | Se nedan |

### C14: formulärfel

| Formulär | Före | Efter |
|---|---|---|
| **Ekonomi** (alla formulär) | Ett ogiltigt belopp gav "Ange ett giltigt belopp." Om namn, beskrivning eller val i listan saknades returnerade formuläret **tyst**, utan något meddelande. Statusregionen renderades bara när den hade text, och en region som läggs in samtidigt med sin text läses ofta inte upp. | Formuläret säger alltid varför posten inte sparades: "Fyll i namn eller beskrivning." eller "Välj i listan först." Statusregionen `.economy-status` (`role="status"`) finns alltid i DOM:en. När den är tom tar den ingen plats i griden (`position: absolute` via `:empty`). |
| **Måltid** (`MealEditor`) | Felet visades som text i etiketten. Fältet hade inget `aria-invalid`, fokus låg kvar på knappen, och inget lästes upp. | Felaktiga fält får `aria-invalid="true"`. Efter en misslyckad sparning går fokus till det första felaktiga fältet, och etiketten innehåller feltexten. En stängd "Näring och portion" öppnas först. |
| Mål | Hade redan `role="alert"` | Nytt test i Chromium, ingen kodändring |
| Recept | Hade redan `aria-invalid`, `aria-describedby` och en status | Nytt test i Chromium, ingen kodändring |
| **Kroppsmått** | Samma mönster som Måltid (inget `aria-invalid` och ingen fokusflytt) | **BLOCKED — CURSOR-OWNED.** Formuläret (`BodyMeasurementsPanel` i `ProgressCenter.jsx`) visas bara i Framstegs mapp "Kroppsscanning" (Body Scan). Samma åtgärd som för Måltid räcker (ungefär 10 rader). |

## C-8Y-N1: dialogkant i appens högkontrast

- **Före:** 8X-dialogerna (`.form-dialog` och `.date-time-dialog`) hade en
  kant med 28 % alfa, ungefär 1,5:1, även i appens högkontrastläge.
- **Efter:** i appens högkontrast är kanten `2px solid var(--border)`
  (`#94a3b8`).

| Läge | Kant | Axe (critical, serious, moderate) |
|---|---|---|
| Normal | oförändrad: 1 px `rgba(120, 150, 255, 0.28)` | 0 |
| Appens högkontrast | 2 px solid `rgb(148, 163, 184)` | 0 |
| Forced colors | 1 px solid (systemfärg) | 0, utom `color-contrast`, som axe inte kan bedöma i forced colors. Samma avgränsning som i `forced-colors.spec.js`. |

## Tester

- **`tests/a11y/gaps-8z3.spec.js`** (nytt, 15 tester i Chromium):
  - reflow i Ekonomi i 5 lägen;
  - tabellsemantiken (C15);
  - formulärfel i Ekonomi, mål, recept och måltid;
  - väderdialogen;
  - Plats på engelska (B10 och C9);
  - dialogkanten i 3 lägen.
- **`more-folders.spec.js`**: moderate i alla 17 mappar, Label in Name per
  mapp, och 17 nya tester för skymd fokus vid 320 px med extra stor text.
- **`tabs-keyboard.spec.js`**: det kända undantaget B-8Z1-N1 är borttaget.
- **`accessibilityLanguageI18n.test.js`** (+4, ingår i `test:a11y`):
  - ingen hårdkodad svenska i PlaceSection, PlaceVoiceCallPanel eller
    tal-kontrollern (strängar och JSX-text, utan kommentarer);
  - Plats-nycklarna finns på svenska och engelska, och varje lagringstid har
    en text;
  - talstatusen följer språket;
  - de 8 dialogerna tar texterna från `confirm`.
- **`voiceConversationController.test.js`**: testerna kontrollerar svensk
  text, så språket sätts nu till `sv` i `beforeEach`. Testernas krav är
  oförändrade.
- **Negativt bevis:** 1 (Ekonomi-reflow, se ovan).

## Full regression

| Körning | Resultat | 8Y-baslinje |
|---|---|---|
| `npm run test:a11y` | **515 av 515** godkända | 502 (511 efter 8Z2) |
| Hela `test:a11y:e2e` | **261 av 261** godkända, 0 fel, 0 flaky, 0 hoppade över (19,4 min) | 227 av 227 |
| Hela Vitest | **4 404 godkända och 96 fel** av 4 500 (960 filer). Alla 96 är de kända i baslinjen, **0 är nya**, och inget fel i baslinjen har börjat gå igenom. | 4 391 godkända, 96 kända fel, 0 nya |
| `i18n:check` | OK | OK |
| `i18n:hardcoded` | 0 signaler | 0 |
| build | OK | OK |
| `git diff --check` | OK | OK |
| lint | 51 (42 fel, 9 varningar), identiskt med baslinjen | 51 |

E2E-ökningen från 227 till 261 består av:
- `gaps-8z3.spec.js`: 15 tester;
- `more-folders.spec.js`: 17 tester för skymd fokus;
- `tabs-keyboard.spec.js` från 8Z1: 2 tester.

## Kvar efter sprinten

**Claude, kod:**
- **Inget öppet A- eller B-fynd.**
- C11 är strukturell.
- Övrig i18n-skuld utanför B10 (se B10 ovan).
- C-8Y-N2 (tidsfältet för vikt) väntar på ett produktbeslut.

**Claude, process:**
- C12: CI med pinnad Chromium. Kräver beslut från repo-ägaren.

**Manuellt (C16 och 8Y avsnitt 6):**
- VoiceOver, TalkBack, NVDA och JAWS;
- Windows kontrastteman;
- walkie-talkie och alarm på riktiga enheter;
- zoom, Dynamic Type och röststyrning;
- taligenkänning på andra språk. Den kan testas nu när B10 är åtgärdat.

**BLOCKED — CURSOR-OWNED** (bara rapporterat):
- **Molnbackup:** 4 `window.confirm` och en dold filväljare som är ett
  Tab-stopp (A-N4). Den är nu även gatad som skymd fokus i C5.
- **Inställningar:** `summary` som är 19 px höga (B-N3).
- **Smart Camera:** fokus i dialogen och Escape.
- **Body Scan:** Label in Name, talsyntes med `sv-SE`, och
  kroppsmåttsformuläret (C14).
- billing, subscriptions, payments, quotas, Supabase/backend och
  kontoradering.
