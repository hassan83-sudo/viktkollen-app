# A11Y-8X5: `confirm()` i veckoplaneringen

Start: `3afef1e`. `origin/main` står kvar på `6a9e920` (Cursor, billing).
Det är bara noterat, inget är mergat. Fyndet är 8M B13, fortsättning på 8X4.

WeeklyMealPlanner ("Planera dagen" i Mat) hade **5** `window.confirm` före
sprinten. Efter sprinten har den **0**.

## Före och efter

| Trigger | Gammal text | OK (oförändrad) | Avbryt | Trigger efter OK | Ny dialog: rubrik / knapp |
|---|---|---|---|---|---|
| "Ta bort {måltid}" på ett planerat kort | Vill du ta bort den planerade måltiden? | måltiden tas bort ur planen och "Planerad måltid borttagen." visas | inget ändras | **försvinner** | Ta bort planerad måltid / Ta bort |
| "Kopiera dagens plan" med läget "Ersätt befintliga" | Vill du ersätta befintliga måltider på måldagarna? | dagen kopieras och ersätter, och "Dagens plan kopierades." visas | ingen kopiering | finns kvar | Ersätt måltider / Ersätt |
| "Registrera som måltid" | Måltiden registrerades. Vill du ta bort den från planen? | måltiden tas bort ur planen | måltiden stannar i planen | **försvinner** vid OK | Måltiden registrerades / Ta bort från planen |
| "Rensa veckoplan" | Vill du rensa vald veckoplan? | veckan töms och "Veckoplanen rensades." visas | inget ändras | finns kvar | Rensa veckoplan / Rensa |
| "Rensa inköpslista" | Vill du rensa vald veckas inköpslista? | listan töms och "Inköpslistan rensades." visas | inget ändras | finns kvar | Rensa inköpslista / Rensa |

**Registrering:** måltiden loggas direkt och statusen visas som förut. Därefter
frågar dialogen bara om måltiden också ska tas bort ur planen. Ordningen är
densamma som med `confirm`, där registreringen också gjordes före frågan.

**Dialogen** är `ConfirmDialog` (8X3), utan något nytt system:
- `alertdialog` med rubrik och den gamla frågan som beskrivning;
- Avbryt har fokus först;
- Escape är detsamma som Avbryt;
- Tab stannar i dialogen;
- `doneRef` gör att varje bekräftelse kör åtgärden en gång;
- texterna ligger i en konstant `confirmCopy` på svenska, som resten av
  komponenten.

## Fokus

- **Avbryt och Escape:** fokus går tillbaka till triggern.
- **När kortet försvinner** (ta bort, eller "Ta bort från planen" efter
  registrering) går fokus till samma dags "Lägg till måltid". Det är nästa
  logiska kontroll i dagkortet. Det sköts av `useFocusAfterConfirm` (8X4) och
  dialogens `fallbackFocusRef`, med en callback-ref per dag.
- **Kopiera, Rensa veckoplan och Rensa inköpslista:** triggern finns kvar, så
  fokus går tillbaka till den.
- Fokus hamnar aldrig på `<body>`.

## Tester

- **`tests/a11y/meal-planner-confirm-dialogs.spec.js`**, nytt, 2 tester i
  Chromium. Alla 5 flöden täcks, och inga webbläsardialoger får öppnas.
  - **Ta bort:**
    - namn, beskrivning och fokus på Avbryt;
    - Tab-fälla;
    - Escape och Avbryt behåller måltiden;
    - bekräftelse tar bort den, och fokus går till dagens "Lägg till måltid".
  - **Registrera:**
    - måltiden loggas direkt (i `localStorage`);
    - Escape behåller den i planen;
    - bekräftelse tar bort den ur planen och loggar inget mer, och fokus går
      till dagen.
  - **Kopiera med ersätt:** Escape kopierar inget, och bekräftelse kopierar
    till måldagen.
  - **Rensa inköpslista och veckoplan:** Avbryt och Escape behåller, och
    bekräftelse tömmer.
- **Axe** med critical, serious och moderate körs på dialogerna "ta bort" och
  "ersätt". Båda ger 0 fynd.
- **Dubbla åtgärder:** skyddet är `doneRef` i ConfirmDialog, som testas i
  `confirmDialog.test.jsx` sedan 8X3.
- **Gaten** i `confirmDialog.test.jsx` är uppdaterad. WeeklyMealPlanner ska ha
  0, Molnbackup exakt 4, och totalen får vara högst 11.
- **Negativt bevis:** inget gjordes. Fokusåterställningen har redan bevisats
  i 8X4 och gaten i 8X3.

**Inte körda:** hela `test:a11y:e2e` och hela Vitest.

## Antal efter sprinten

| | Totalt | Claude | Cursor (Molnbackup) |
|---|---|---|---|
| **Före** | 16 | 12 | 4 |
| **Efter** | 11 | 7 | 4, orörda |

**Kvar (Claude):** App 2, CoachMemoryReview 1, GoalsHabitsPanel 1,
AccessibilityHub 1 och ManualAcceptanceRunner 2.
