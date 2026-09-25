# A11Y-8X1: Datum- och tidsdialoger

Start: `1a14cbb`. `origin/main` har flyttats till `59c706a` (Cursor, billing).
Det är bara noterat, inget är mergat. Fyndet är 8M B13 (8T avsnitt 19).
Sprinten gäller bara datum- och tidsfrågorna i MealLogger och ProgressCenter.

## Ersatta `prompt()` (6 av 9)

| Fil | Flöde | Före (`window.prompt`) |
|---|---|---|
| `MealLogger.jsx` | "Kopiera {måltid}" i historiken | Två frågor efter varandra: datum (förifyllt med valt matdatum, texten anger "(ÅÅÅÅ-MM-DD)") och tid (förifylld med nu, texten anger "(TT:MM)") |
| `MealLogger.jsx` | Favorit, "Lägg till idag" | Två frågor: datum (valt matdatum) och tid (nu). Inget format angavs. |
| `ProgressCenter.jsx` | Vikthistorik, "Kopiera" | Två frågor: datum (viktens datum) och tid (viktens tid) |

**Beteende före:**
- **Avbryt vid datumfrågan:** inget sparades.
- **Tom tid eller Avbryt vid tidsfrågan:** tiden föll tillbaka på nu, eller på
  viktens tid.
- **Ogiltigt värde:** misslyckades tyst. Fritext som "abc" blev dagens datum
  och tid. "2026-13-45" och "25:99" sparades som de var. För en måltid gav ett
  ogiltigt datum `null` från `mealDraftToMeal`.
- **Uppdaterad data:** `onMealsChange` (en kopia, eller en ny måltid från
  favoriten) respektive `onWeightsChange` (`upsertWeight` och
  `copyWeightToDate`). Detta är oförändrat.

## Efter

**Komponenten.** En gemensam `DateTimeDialog` (`src/components/a11y/`):
- **Dialogen:** byggd på `ModalDialog`, alltså 8C-systemet. Den är namngiven
  av rubriken, till exempel "Kopiera Havregrynsgröt", "Lägg till Kvarg" eller
  "Kopiera vikten 80,4 kg från 2026-09-25". Beskrivningen är formattexten.
- **Fälten:** "Datum" (`type="date"`) och "Tid" (`type="time"`), med samma
  förifyllda värden som före.
- **Knapparna:** "Kopiera" eller "Lägg till", samt "Avbryt".
- **Rendering:** i `document.body` via en portal, eftersom Mat döljer alla andra
  barn till den aktiva panelen.

**Validering:**
- Datumet måste vara ett riktigt kalenderdatum (ÅÅÅÅ-MM-DD) och tiden en
  24-timmarstid (TT:MM). Tomma värden godtas inte.
- Vid fel sparas ingenting. Då visas ett meddelande i en liten
  `role="status"`, som alltid finns i DOM:en (samma mönster som 8U). De felaktiga
  fälten får `aria-invalid` och `aria-describedby` som pekar på meddelandet.
- Fokus stannar där formuläret skickades, så meddelandet läses upp en gång.
- En ändring i något fält rensar felet.
- Det finns ingen tyst fallback längre.

**Tangentbord och fokus:**
- Fokus flyttas till datumfältet när dialogen öppnas.
- Tab och Shift+Tab stannar i dialogen. Chromium stannar också på delarna i de
  inbyggda datum- och tidsfälten.
- Enter i ett fält sparar.
- Escape och Avbryt stänger utan att spara.
- Fokus går tillbaka till knappen som öppnade dialogen.
- **Vikthistoriken:** appen bygger om den dagliga viktlistan med nya id när en
  vikt läggs till. Knappen som öppnade dialogen finns därför inte kvar efter
  Spara, och fokus hamnade på `<body>`. Nu går fokus till samma viktposts nya
  "Kopiera"-knapp (`data-copy-weight-id`). Fokus hamnar aldrig på `<body>`.

**i18n:** `common.dateTimeDialog`, `nutrition.logger.dateTimeDialog` och
`progress.center.dateTimeDialog`, på svenska och engelska. De gamla
`prompts.copyDate/Time` och `favoriteDate/Time` ligger kvar men används inte.

## Tester

- **`tests/a11y/date-time-dialogs.spec.js`**, nytt, 3 tester i Chromium. De
  kontrollerar även att `window.prompt` aldrig anropas.
  - **Mat, "Kopiera":**
    - namn, beskrivning, etiketter, typ, startvärden och initialt fokus;
    - Tab och Shift+Tab stannar i dialogen;
    - Escape och fokusretur;
    - tomt datum: status, `aria-invalid`, beskrivning, fokus kvar och exakt en
      region, och felet rensas vid ändring;
    - Avbryt sparar inget;
    - Enter sparar och fokus går tillbaka.
  - **Mat, favorit:** namn, fokus, att måltiden sparas och fokusretur.
  - **Framsteg, vikt:**
    - startvärden från posten;
    - Escape;
    - tom tid ger fel;
    - Enter sparar, fokus går tillbaka och en rad tillkommer.
  - **Axe** med critical, serious och moderate körs på dialogen i fyra lägen:
    kopiera måltid, felmeddelande, favorit och kopiera vikt. Alla ger 0 fynd.
- **`src/components/a11y/DateTimeDialog.test.jsx`**, 6 tester (ingår i
  `test:a11y`, som nu är 493):
  - semantik;
  - spara;
  - tomma värden och rensning;
  - Avbryt;
  - validering;
  - att MealLogger och ProgressCenter inte längre frågar efter datum eller tid
    med `window.prompt`.
- **Negativt bevis:** utan valideringsspärren sparades ett ogiltigt värde, och
  Framstegstestet föll (inget felmeddelande). Det är återställt.

**Inte körda:** hela `test:a11y:e2e` och hela Vitest.

## Kvar (B13)

- **`prompt()`, 3 st:**
  - importläge i `MealLogger` och i `ProgressCenter` (fritext med
    "ersätt/slå ihop");
  - anteckning i `ProgressPhotos`.
- **`confirm()`, 30 st, oförändrade:**
  - ProgressCenter 7, WeeklyMealPlanner 5, MealLogger 4;
  - CloudBackupPanel 4 (**BLOCKED — CURSOR-OWNED**);
  - ManualAcceptanceRunner 2, App 2;
  - 1 var i RecipeManager, MealQuickAdd, AccessibilityHub, CoachMemoryReview,
    DietaryPreferencesPanel och GoalsHabitsPanel.
- **Vikten behåller inte vald tid.** Appens dagliga vikt lagrar tiden som
  12:00, så en kopia behåller datumet men inte den valda tiden. Så var det även
  före sprinten, och det hör till datamodellen, inte till dialogen.
