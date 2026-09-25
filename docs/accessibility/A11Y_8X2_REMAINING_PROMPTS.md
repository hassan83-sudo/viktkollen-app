# A11Y-8X2: De sista `prompt()`

Start: `8b40630`. `origin/main` står kvar på `59c706a` (Cursor, billing).
Det är bara noterat, inget är mergat. Fyndet är 8M B13, fortsättning på 8X1.

**Före:** 3 `window.prompt`. **Efter:** 0 i produktionskoden. Det verifieras med en
permanent kodsökning (se Tester).

## Före

| Flöde | Trigger | Fråga och standardvärde | Tomt värde eller Avbryt | Giltiga och ogiltiga värden | Data |
|---|---|---|---|---|---|
| **Mat, importläge** (`MealLogger`) | "Välj säkerhetskopia", sedan en JSON-fil | "Importen innehåller N måltider, … Skriv "slå ihop" eller "ersätt"." Standard: "slå ihop". | "Import avbröts." Inget ändras. | Text som innehåller "ers" betyder ersätt, och ersätt kräver en `confirm`. **All annan text blir tyst "slå ihop"**, även felstavningar. | måltider, favoriter, mallar, recept, matpreferenser och kostmål |
| **Framsteg, importläge** (`ProgressCenter`) | "Importera JSON", sedan en fil | "Importen innehåller N viktposter, … Skriv "slå ihop" eller "ersätt"." Standard: "slå ihop". | "Import avbröts." | Samma som Mat | vikter, kroppsmått, rapporter och målinställningar |
| **Framstegsbild, anteckning** (`ProgressPhotos`) | "Redigera" på en bild | "Uppdatera anteckning". Standard: bildens anteckning. | Avbryt ändrar inget. Ett tomt svar tömmer anteckningen. | Fritext | `onUpdateProgressPhoto(id, { note })` |

## Efter

- **`FormDialog`** (`src/components/a11y/`) är ett litet gemensamt skal. Det
  bygger på `ModalDialog` (8C), som nu också skickar vidare
  `fallbackFocusRef`. Skalet ger:
  - rubrik som namnger dialogen, och en beskrivning;
  - knapparna Skicka och Avbryt;
  - rendering i `document.body`, samma skal och CSS som 8X1.
- **`ImportModeDialog`** används både i Mat och i Framsteg:
  - "Importera säkerhetskopia", där beskrivningen är innehållet i importen;
  - en radiogrupp "Hur ska importen läggas in?" med "Slå ihop med befintlig
    data" (förvald, som promptens standard) och "Ersätt befintlig data";
  - knapparna "Importera" och "Avbryt".

  Inga fritextsvar gissas längre. Avbryt och Escape ger "Import avbröts.".
  Ersätt följs av samma `confirm` som förut, som inte ändras i denna sprint.
  Datan som uppdateras är densamma som förut.
- **`NoteDialog`:** "Redigera anteckning", en märkt textarea "Anteckning" med
  bildens anteckning, och knapparna "Spara" och "Avbryt".
  - En tom anteckning sparas som tom, precis som förut.
  - Avbryt och Escape ändrar inget, så ingen data försvinner tyst.
- **i18n:** `common.importModeDialog`, `common.noteDialog` och
  `logger.prompts.importSummary` / `center.prompts.importSummary`, på svenska
  och engelska.

## Fokus och tangentbord

- **När dialogen öppnas:** fokus går till det valda alternativet
  ("Slå ihop"), eller till textarean.
- **Importdialogen:**
  - pilarna byter alternativ;
  - Tab går vidare till "Importera" och "Avbryt" och tillbaka, och Shift+Tab
    går baklänges;
  - Enter på ett alternativ importerar.
- **Anteckningen:** Enter ger radbrytning i textarean. Man sparar med knappen
  "Spara".
- **Stängning:** Escape och Avbryt stänger. Fokus går tillbaka till "Välj
  säkerhetskopia", "Importera JSON" eller "Redigera". För importen finns också
  `fallbackFocusRef` till den synliga importknappen, om fokus före öppnandet
  låg på den dolda filväljaren.
- Fokus hamnar aldrig på `<body>`.

## Tester

- **`tests/a11y/remaining-prompts.spec.js`**, nytt, 3 tester i Chromium. De
  kontrollerar också att inget `prompt` öppnas. `confirm` vid Ersätt godkänns.
  - **Mat:**
    - appens egen export används som fil;
    - namn, beskrivning, radiogrupp, förval och initialt fokus;
    - Tab och Shift+Tab;
    - Escape och Avbryt ger ingen import, och fokus går tillbaka;
    - Enter slår ihop (antalet måltider fördubblas);
    - pil ned och Enter ersätter (samma antal som i säkerhetskopian).
  - **Framsteg:**
    - Escape;
    - "slå ihop" behåller båda vikterna;
    - "ersätt" återställer säkerhetskopian (1 vikt).
  - **Bilder:**
    - etikett, startvärde och initialt fokus;
    - Tab-ordning;
    - Escape och Avbryt behåller anteckningen;
    - Spara visar den nya texten, och fokus går tillbaka till "Redigera".

  Axe med critical, serious och moderate körs på de tre dialogerna. Alla ger 0
  fynd.
- **`src/components/a11y/remainingPrompts.test.jsx`**, 3 tester (ingår i
  `test:a11y`, som nu är 496):
  - **prompt-gaten:** inga anrop till `window.prompt(` eller `prompt(` i
    produktionsfilerna under `src/`. Kommentarer och andra API:er, som PWA:ns
    `promptEvent.prompt()`, räknas inte.
  - importdialogen;
  - anteckningsdialogen.
- **Negativt bevis:** med `window.prompt` tillbaka i ProgressPhotos faller
  gaten (`components/ProgressPhotos.jsx`). Det är återställt.

**Inte körda:** hela `test:a11y:e2e` och hela Vitest.

## Prompt-gaten

- **Claude-ägda:** 0 `window.prompt`.
- **Cursor-ägda:** 0 träffar.
- **Enda träff:** `PwaExperience.jsx`, `promptEvent.prompt()`. Det är
  webbläsarens installationsdialog för PWA, inte `window.prompt`.

## Kvar: `confirm()` (30, oförändrade)

- ProgressCenter 7, WeeklyMealPlanner 5, MealLogger 4.
- CloudBackupPanel 4 (**BLOCKED — CURSOR-OWNED**).
- ManualAcceptanceRunner 2, App 2.
- 1 var i RecipeManager, MealQuickAdd, AccessibilityHub, CoachMemoryReview,
  DietaryPreferencesPanel och GoalsHabitsPanel.
