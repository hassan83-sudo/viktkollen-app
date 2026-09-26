# A11Y-8X6: De sista `confirm()`

Start: `dd380ca`. `origin/main` har flyttats till `462c945` (Cursor, billing).
Det är bara noterat, inget är mergat. Fyndet är 8M B13, sista delen efter
8X1–8X5.

## Resultat

| | Före 8X6 | Efter 8X6 |
|---|---|---|
| Claude-ägda `window.prompt` | 0 | **0** |
| Claude-ägda `window.confirm` | 7 | **0** |
| Molnbackup (`CloudBackupPanel`, Cursor) | 4 | **4**, orörda (ingen diff), **BLOCKED — CURSOR-OWNED** |

`PwaExperience.jsx` anropar `promptEvent.prompt()`. Det är webbläsarens
installationsdialog för PWA, inte `window.prompt`, och räknas inte.

Sammanlagt har 8X1–8X6 ersatt 9 `prompt` och 26 `confirm` i Claude-området.

## De 7 ersatta

| Fil | Trigger | Text | OK (oförändrad) | Avbryt | Destruktiv | Trigger efter OK | Fokus efter OK |
|---|---|---|---|---|---|---|---|
| `App.jsx` till `AICoach.jsx` | "Rensa historik" | Vill du rensa all coachhistorik? | coachhistoriken töms | inget ändras | ja | försvinner | rubriken "Personlig coach" |
| `App.jsx` till `ProgressPhotos.jsx` | "Ta bort" på en bild | Vill du ta bort den här framstegsbilden? | bilden tas bort | inget ändras | ja | försvinner | rubriken "Framstegsbilder" |
| `CoachMemoryReview.jsx` | "Glöm alla härledda minnen" | Vill du glömma alla härledda coachminnen? Preferenser behålls. | härledda minnen glöms, och status visas | inget ändras | ja | finns kvar | knappen (annars rubriken) |
| `GoalsHabitsPanel.jsx` | "Ta bort permanent" i arkivet | Vill du ta bort det arkiverade objektet permanent? | objektet tas bort permanent | inget ändras | ja | försvinner | rubriken "Arkiv och historik" |
| `AccessibilityHub.jsx` | "Återställ tillgänglighetsinställningar" | Vill du återställa bara tillgänglighetsinställningarna i den här vyn? (i18n) | inställningarna återställs, och status visas | inget ändras | ja | finns kvar | knappen |
| `ManualAcceptanceRunner.jsx` (dev) | "Skapa TESTDATA" | Skapa markerad TESTDATA för acceptance-test? | TESTDATA skapas | inget | nej | finns kvar | knappen |
| `ManualAcceptanceRunner.jsx` (dev) | "Rensa TESTDATA" | Rensa endast markerad TESTDATA? … Förhandsvisning: N objekt. | markerad TESTDATA rensas | inget | ja | finns kvar | knappen |

**App.jsx:**
- Frågorna låg i de callbacks som App skickar till AICoach och ProgressPhotos.
  Nu ställs frågan i komponenten, med ConfirmDialog.
- Callbacken i App gör bara själva åtgärden. Det blir samma operation, och den
  körs bara efter en bekräftelse.
- Ingen annan komponent använde de två callbackarna.

**Nära Cursor-områden:** inget stoppades.
- Framstegsbilder ligger i Framsteg, inte i Body Scan.
- `BodyAnalysisCard`, som ligger i samma fil, är inte ändrad.

## Beteende och fokus

- Alla 7 använder `ConfirmDialog` (8X3), utan något nytt system:
  - `alertdialog` med rubrik och den gamla frågan som beskrivning;
  - Avbryt har fokus först;
  - Tab och Shift+Tab stannar i dialogen;
  - Escape är detsamma som Avbryt;
  - `doneRef` gör att varje bekräftelse kör åtgärden en gång.
- **När triggern försvinner** används `useFocusAfterConfirm` (8X4) och
  `fallbackFocusRef` med panelens rubrik (`tabIndex=-1`).
- **När triggern finns kvar** går fokus tillbaka till den.
- Fokus hamnar aldrig på `<body>`.
- **CoachMemoryReview** har en egen Escape-hanterare som stänger hela vyn.
  Medan dialogen är öppen går Escape nu bara till dialogen (Avbryt), så att
  vyn inte stängs.

## Zero-gate

**`src/components/a11y/confirmDialog.test.jsx`:**
- Antalet `window.confirm` per produktionsfil måste vara exakt
  `{ 'components/CloudBackupPanel.jsx': 4 }`.
- Alla andra filer, även nya, ger fel om de innehåller `confirm`.
- Molnbackup måste ha exakt 4.
- Kommentarer räknas inte.

**`src/components/a11y/remainingPrompts.test.jsx`** (8X2): 0 `window.prompt`
och bara `prompt(` i produktionskoden. `obj.prompt()`, som i PWA, räknas inte.

Kvar av webbläsardialogerna är alltså bara de 4 i Molnbackup, och gaten gör
att de uttryckligen blockeras av Cursor-området.

## Tester

- **`tests/a11y/final-confirm-dialogs.spec.js`**, nytt, 3 tester i Chromium.
  Inga webbläsardialoger får öppnas.
  - **AI Coach, rensa historik:**
    - namn, beskrivning och fokus på Avbryt;
    - Tab-fälla;
    - Escape behåller historiken, och fokus går tillbaka;
    - bekräftelse tömmer historiken, och fokus går till "Personlig coach".
  - **Framstegsbilder, ta bort:** Avbryt behåller bilden, och bekräftelse tar
    bort den. Fokus går till "Framstegsbilder".
  - **Tillgänglighet, återställ:** Escape behåller "Stor text", och
    bekräftelse återställer. Fokus går tillbaka till knappen.
- **`src/components/a11y/finalConfirmDialogs.test.jsx`**, nytt, 3 tester i
  jsdom:
  - **GoalsHabitsPanel:** Avbryt och Escape behåller; en bekräftelse tar bort
    en gång (även vid dubbelklick); fokus går till "Arkiv och historik".
  - **CoachMemoryReview:** Escape stänger bara dialogen, inte vyn; bekräftelse
    glömmer en gång; utan öppen dialog stänger Escape vyn som förut.
  - **ManualAcceptanceRunner:** Avbryt och Escape kör ingenting; varje
    bekräftelse kör en gång. Fixture-tjänsten är mockad, eftersom den kräver
    appens datarepository.
- **`AccessibilityHub.test.jsx`:** återställningstestet klickar sig nu igenom
  dialogen (Avbryt behåller, och "Återställ" återställer) i stället för att
  mocka `window.confirm`.
- **Axe** med critical, serious och moderate körs på tre dialoger: rensa
  coachhistorik, ta bort bild och återställ. Alla ger 0 fynd.
- **Negativt bevis:** utan Escape-skyddet i CoachMemoryReview stänger Escape
  hela vyn, och testet faller. Det är återställt. Övriga mekanismer bevisades i
  8X3–8X5.

**Inte körda:** hela `test:a11y:e2e` och hela Vitest.

## Manuell uppföljning

- **Skärmläsare** (NVDA, VoiceOver och TalkBack): att `alertdialog`, rubrik
  och beskrivning läses upp när dialogen öppnas, och att fokus på Avbryt
  meddelas.
- **Molnbackup:** Cursor bör ersätta de 4 `confirm` med `ConfirmDialog`.
  Gaten kräver då att Molnbackups tillåtna antal sänks till 0.
