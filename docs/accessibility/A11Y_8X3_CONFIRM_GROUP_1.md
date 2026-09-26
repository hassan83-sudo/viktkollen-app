# A11Y-8X3: `confirm()`, grupp 1 (Framsteg)

Start: `ba1b5a1`. `origin/main` har flyttats till `6a9e920` (Cursor, billing).
Det är bara noterat, inget är mergat. Fyndet är 8M B13, fortsättning på 8X1 och
8X2.

## Inventering före (30 `window.confirm`)

Vid OK körs åtgärden. Vid Avbryt ändras ingenting, om inget annat anges.

| Grupp | Fil | Anrop (text i korthet) | Antal |
|---|---|---|---|
| **A. Framsteg** (vald) | `ProgressCenter.jsx` | ta bort viktpost; ta bort markerade viktposter; ta bort kroppsmått; "rapport finns redan idag, skapa ändå?"; ta bort rapport; rensa rapporthistorik; ersätt vid import (Avbryt ger "Import avbröts.") | 7 |
| B. Mat | `MealLogger.jsx` | ta bort måltid, ta bort favorit, rensa kostmål, ersätt vid import | 4 |
| B. Mat | `WeeklyMealPlanner.jsx` | ta bort planerad måltid, ersätt vid kopiering, "registrerad, ta bort från planen?", rensa veckoplan, rensa inköpslista | 5 |
| B. Mat | `RecipeManager`, `MealQuickAdd`, `DietaryPreferencesPanel` | ta bort recept, ta bort mall, ta bort matpreferenser | 3 |
| C. Coach och mål | `App.jsx` | rensa coachhistorik, ta bort framstegsbild | 2 |
| C. Coach och mål | `CoachMemoryReview`, `GoalsHabitsPanel` | glöm härledda minnen, ta bort arkiverat objekt | 2 |
| D. Övrigt | `AccessibilityHub` | återställ tillgänglighetsinställningar | 1 |
| D. Övrigt | `ManualAcceptanceRunner` | skapa och rensa TESTDATA (utvecklingsverktyg) | 2 |
| **Cursor** | `CloudBackupPanel.jsx` (Molnbackup) | återställ, radera, importera, ångra | 4, **BLOCKED — CURSOR-OWNED** |

Av de 30 är 26 Claude-ägda och 4 Cursor-ägda.

## Vald grupp: Framsteg (7)

Varför den här gruppen:
- alla anrop ligger i en komponent, som var testad sedan 8X1 och 8X2;
- 6 av 7 är destruktiva;
- texterna finns redan i i18n;
- ingen Cursor-kod berörs.

Gruppen innehåller också ersättningen vid import från 8X2, så importflödet i
Framsteg har inte längre någon webbläsardialog.

## Efter

**`ConfirmDialog`** (`src/components/a11y/`):
- **Semantik:** `role="alertdialog"` på `ModalDialog` (8C), med en rubrik som
  namnger dialogen och frågan som beskrivning.
- **Knappar:** en bekräftelseknapp och "Avbryt".
- **Fokus:** börjar på "Avbryt", så att en oavsiktlig Enter aldrig bekräftar.
  Tab och Shift+Tab stannar i dialogen. Escape är detsamma som Avbryt.
- **Dubbla åtgärder:** en bekräftelse kör åtgärden en gång, även vid
  dubbelklick.
- **Rendering:** i `document.body`, samma skal som 8X1 och 8X2.

| Tidigare `confirm` | Rubrik | Knapp |
|---|---|---|
| deleteWeight | Ta bort viktpost | Ta bort |
| deleteWeights | Ta bort markerade viktposter | Ta bort |
| deleteMeasurement | Ta bort kroppsmått | Ta bort |
| duplicateReport | Rapporten finns redan | Skapa ändå (inte destruktiv) |
| deleteReport | Ta bort rapport | Ta bort |
| clearReports | Rensa rapporthistorik | Rensa |
| replaceImport | Ersätt framstegsdata | Ersätt |

**Beteende:**
- Bekräftelsen kör exakt samma kod som följde efter `confirm`.
  `ProgressCenter` har ett tillstånd `confirmRequest` och funktionen
  `runConfirmed`.
- Avbryt och Escape ändrar ingen data. Vid import sätts "Import avbröts.",
  som förut.

**Fokus:**
- Efter Avbryt och Escape går fokus tillbaka till knappen som frågade.
- **När knappen försvinner efter en bekräftelse** (raden raderas, eller
  "Ta bort markerade" och "Rensa" blir inaktiva) går fokus till panelens
  rubrik (`tabIndex=-1`): "N träffar", "N kroppsmått" eller "Vecko- och
  månadsrapport". Vid import går fokus till "Importera JSON".
- Fokus flyttas i en effekt efter commit. Viktlistan byggs om med nya id, så
  dialogen hann annars lämna fokus på en knapp som sedan togs bort, och fokus
  hamnade på `<body>`.
- Fokus hamnar aldrig på `<body>`.

## Antal

| | Totalt | Claude | Cursor (Molnbackup) |
|---|---|---|---|
| **Före** | 30 | 26 | 4 |
| **Efter** | 23 | 19 | 4, orörda |

**Gate:** `src/components/a11y/confirmDialog.test.jsx` innehåller antalet
tillåtna `window.confirm` per fil.
- En fil får bara minska.
- En ny fil med `confirm` ger fel.
- Totalen får vara högst 23.
- ProgressCenter ska ha 0, och Molnbackup exakt 4.

## Tester

- **`tests/a11y/confirm-dialogs.spec.js`**, nytt, 2 tester i Chromium. De
  kontrollerar också att ingen webbläsardialog öppnas.
  - **Vikter:**
    - namn, beskrivning och initialt fokus på Avbryt;
    - Tab och Shift+Tab;
    - Escape och Avbryt behåller raden, och fokus går tillbaka;
    - bekräftelse med tangentbordet tar bort en rad, och fokus går till
      rubriken;
    - markerade tas bort, och fokus går till rubriken.
  - **Rapporter:**
    - dubblett: Avbryt skapar ingen rapport, och "Skapa ändå" med dubbelklick
      skapar exakt en;
    - ta bort en rapport;
    - rensa allt, där fokus går till rubriken.
- **`tests/a11y/remaining-prompts.spec.js`** (8X2): testet för Framsteg
  använder nu ConfirmDialog för "Ersätt". Avbryt behåller datan och ger "Import
  avbröts.", och Ersätt ersätter. Mat använder fortfarande webbläsarens
  `confirm` och är oförändrat.
- **`src/components/a11y/confirmDialog.test.jsx`**, 3 tester (ingår i
  `test:a11y`, som nu är 499):
  - gaten;
  - ConfirmDialog (semantik, initialt fokus och en åtgärd per bekräftelse);
  - kroppsmått i ProgressCenter (Avbryt, Escape, att bara det valda tas bort,
    och fokus till rubriken). Kroppsmåtten ligger i Kroppsscanning-mappen, som
    är Body Scan och Cursor-ägd, så det flödet testas i jsdom i stället för att
    navigera dit.
- **Axe** med critical, serious och moderate körs på tre dialoger: ta bort
  vikt, dubblettrapport och ersätt vid import. Alla ger 0 fynd.
- **Negativt bevis:** utan fokus på Avbryt från början hamnar fokus på den
  destruktiva knappen, och testet faller. Det är återställt.

**Inte körda:** hela `test:a11y:e2e` och hela Vitest.

## Återstående grupper

- **B. Mat:** 12 `confirm` (MealLogger 4, WeeklyMealPlanner 5, RecipeManager,
  MealQuickAdd och DietaryPreferencesPanel). Förslaget är nästa grupp, i två
  delar: MealLogger med små filer, och sedan WeeklyMealPlanner.
- **C. Coach och mål:** 4 `confirm` (App 2, CoachMemoryReview och
  GoalsHabitsPanel).
- **D. Övrigt:** 3 `confirm` (AccessibilityHub och ManualAcceptanceRunner).
- **Molnbackup:** 4 `confirm`, **BLOCKED — CURSOR-OWNED**.
