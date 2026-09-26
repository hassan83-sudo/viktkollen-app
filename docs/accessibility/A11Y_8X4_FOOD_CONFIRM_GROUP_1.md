# A11Y-8X4: `confirm()` i Mat, grupp 1

Start: `5507059`. `origin/main` står kvar på `6a9e920` (Cursor, billing).
Det är bara noterat, inget är mergat. Fyndet är 8M B13, fortsättning på 8X3.

## Antal

| | Totalt | Claude | Cursor (Molnbackup) |
|---|---|---|---|
| **Före** | 23 | 19 | 4 |
| **Efter** | 16 | 12 | 4, orörda |

Inventeringen före stämde med uppdraget: MealLogger 4, RecipeManager 1,
MealQuickAdd 1, DietaryPreferencesPanel 1 och WeeklyMealPlanner 5.

## Ersatta (7)

Alla använder samma `ConfirmDialog` som 8X3. Avbryt har fokus först, Escape
är detsamma som Avbryt och varje bekräftelse kör åtgärden en gång.

| Fil | Trigger | Gammal text | OK-effekt (oförändrad) | Destruktiv | Rubrik och knapp | Fokus efter OK |
|---|---|---|---|---|---|---|
| MealLogger | historik: "Ta bort {måltid}" | Vill du ta bort den här måltiden? | måltiden tas bort; formuläret återställs om måltiden redigerades | ja | Ta bort måltid / Ta bort | rubriken "N träffar" |
| MealLogger | Favoriter: "Ta bort" | Vill du ta bort den här favoriten? | favoriten tas bort | ja | Ta bort favorit / Ta bort | rubriken "Favoritmåltider" |
| MealLogger | Näringsmål: "Återställ mål" | Vill du rensa alla kostmål? | alla kostmål töms | ja | Rensa kostmål / Rensa | knappen finns kvar |
| MealLogger | import, "Ersätt" (8X2) | Detta ersätter endast kostdata lokalt. Vill du fortsätta? | kostdatan ersätts; Avbryt ger "Import avbröts." | ja | Ersätt kostdata / Ersätt | "Välj säkerhetskopia" |
| RecipeManager | "Ta bort" på ett recept | Vill du ta bort receptet? | receptet tas bort och "Receptet togs bort." visas | ja | Ta bort recept / Ta bort | rubriken "Dina recept" |
| MealQuickAdd | "Radera" på en mall | Vill du ta bort mallen "{namn}"? | mallen tas bort (sparade måltider påverkas inte) | ja | Radera mall / Radera | rubriken "Sparade mallar" |
| DietaryPreferencesPanel | "Rensa" | Vill du ta bort dina sparade matpreferenser? | preferenserna rensas och "Matpreferenser rensade." visas | ja | Rensa matpreferenser / Rensa | knappen finns kvar |

- **Avbryt och Escape:** ingen data ändras, och fokus går tillbaka till
  triggern.
- **i18n:** texterna i MealLogger ligger i `logger.confirmDialog` (svenska och
  engelska). RecipeManager, MealQuickAdd och DietaryPreferencesPanel har redan
  svensk text direkt i koden, och dialogtexten följer samma mönster.

## Fokus

- När en rad eller ett kort försvinner går fokus till listans rubrik
  (`tabIndex=-1`). Den nya hooken `useFocusAfterConfirm` flyttar fokus efter
  commit om det har tappats: `<body>`, ett borttaget element eller en inaktiv
  knapp. Det är samma idé som effekten i ProgressCenter (8X3).
- Dialogens `fallbackFocusRef` pekar på samma rubrik.
- Fokus hamnar aldrig på `<body>`.

## Gate

`src/components/a11y/confirmDialog.test.jsx` innehåller antalet tillåtna
`window.confirm` per fil.
- MealLogger, RecipeManager, MealQuickAdd, DietaryPreferencesPanel och
  ProgressCenter ska ha 0.
- WeeklyMealPlanner ska ha exakt 5 och Molnbackup exakt 4.
- Totalen får vara högst 16, det vill säga 23 minus de 7 ersatta.
- En ny fil med `confirm` ger fel.

## Tester

- **`tests/a11y/food-confirm-dialogs.spec.js`**, nytt, 3 tester i Chromium.
  Inga webbläsardialoger får öppnas.
  - **Måltid och favorit:**
    - namn, beskrivning och initialt fokus på Avbryt;
    - Tab-fälla;
    - Escape och Avbryt behåller måltiden (kontrollerat i `localStorage`), och
      fokus går tillbaka;
    - "Ta bort" tar bort just den måltiden, och fokus går till "1 träffar";
    - favoriten tas bort, och fokus går till "Favoritmåltider".
  - **Kostmål och matpreferenser:** Escape och Avbryt behåller datan, och
    "Rensa" tömmer. Fokus går tillbaka till knappen.
  - **Recept och mall:** Escape och Avbryt behåller dem, och bekräftelse tar
    bort dem. Fokus går till "Dina recept" respektive "Sparade mallar".
- **`remaining-prompts.spec.js`** (8X2): "Ersätt" i Mat går nu via
  ConfirmDialog. Avbryt ger "Import avbröts." och ingen ersättning, och
  bekräftelse ersätter.
- **Gaten** i `confirmDialog.test.jsx`, uppdaterad. Skyddet mot dubbla åtgärder
  testas där sedan 8X3.
- **Axe** med critical, serious och moderate körs på fyra dialoger: ta bort
  måltid, rensa kostmål, ta bort recept och ersätt vid import. Alla ger 0
  fynd.
- **Negativt bevis:** utan `useFocusAfterConfirm` i MealLogger hamnar fokus på
  `<body>` efter borttagningen, och testet faller. Det är återställt.

**Inte körda:** hela `test:a11y:e2e` och hela Vitest.

## Kvar till 8X5

**WeeklyMealPlanner, 5 st, oförändrade:**
- ta bort planerad måltid;
- ersätt vid kopiering;
- "registrerad, ta bort från planen?";
- rensa veckoplan;
- rensa inköpslista.

**Övriga Claude-ägda:** App 2, CoachMemoryReview 1, GoalsHabitsPanel 1,
AccessibilityHub 1 och ManualAcceptanceRunner 2.

**Molnbackup:** 4, **BLOCKED — CURSOR-OWNED**.
