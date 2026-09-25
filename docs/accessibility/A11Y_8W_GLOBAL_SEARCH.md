# A11Y-8W: GlobalSearch

Start: `6ec32c1`. `origin/main` står kvar på `75e52d2` (Cursor). Det är bara
noterat, inget är mergat. Fyndet kommer från 8M (B4) och bekräftades i 8T.

## Före (reproducerat i Chromium)

- **Fältet:** `role="searchbox"` med `aria-activedescendant` och
  `aria-controls`, men utan `aria-expanded`.
- **Alternativen:** alla var Tab-stopp, 5 av 5 efter sökningen "vikt". Det
  blandade två mönster: fokus i fältet med pilar, och fokus på alternativen med
  Tab.
- **Status:** ingen live-region i dialogen, så antalet träffar meddelades inte.
- **Listboxen:** innehöll `section` med `aria-label` samt ett `<p>` direkt i
  listboxen, som vid 0 träffar.
- **Aktivt alternativ:** första alternativet var aktivt redan när dialogen
  öppnades, trots att inget hade valts.

## Valt mönster

**Combobox med listbox-popup** (APG, "list autocomplete"). Det motsvarar den
befintliga UX:en: fokus stannar i sökfältet och piltangenterna flyttar
markeringen. Enter och Escape fungerar som tidigare. Alternativen är inte längre
Tab-stopp, och bara ett mönster används.

## Semantik efter

| Del | Efter |
|---|---|
| **Fältet** | `role="combobox"`, `aria-autocomplete="list"`, `aria-controls="global-search-results"` och `aria-expanded`. `aria-expanded` är sant när listan har alternativ, vilket den alltid har när dialogen är öppen: förslag, träffar eller närliggande alternativ. |
| **Aktivt alternativ** | Inget från början. Pil ned går till första alternativet och pil upp till sista, med wrap. `aria-activedescendant` finns bara när ett alternativ är aktivt. Det tas bort när sökningen ändras eller rensas, så det pekar aldrig på ett element som inte finns. Det aktiva alternativet har `aria-selected="true"` och en synlig markering, och det scrollas in i vy. |
| **Alternativen** | `role="option"` med `tabIndex=-1`. Ett musklick flyttar inte fokus från fältet. |
| **Grupper** | `role="group"`, namngiven av gruppens rubrik via `aria-labelledby`. Rubriken har `role="presentation"`. Vid 0 träffar är de närliggande alternativen en grupp som namnges av meddelandet. |
| **Enter** | Öppnar det aktiva alternativet. Utan aktivt alternativ öppnar Enter första träffen i en skriven sökning, precis som förut. |
| **Escape** och fokusretur | Oförändrat (dialogsystemet från 8C) |

## Meddelanden

- En liten `role="status"`, `#global-search-status` (`sr-only`), är den enda
  live-regionen i dialogen. Listan är inte live.
- **Skriven sökning:** "N träffar" eller "1 träff". Texten kommer från i18n
  (`search.resultCount_one` och `_other`, på svenska och engelska).
- **0 träffar:** den befintliga texten `search.noExactMatches`, "Inga exakta
  träffar för "x". Här är närliggande alternativ."
- **Utan sökning** (förslagen visas): tom. Inget läses upp när dialogen
  öppnas.
- Texten ändras bara när antalet eller utfallet ändras, så samma antal läses
  inte upp igen.

## Tester

- **`tests/a11y/global-search.spec.js`**, nytt, 4 tester:
  - A: semantiken, kontrollerad även i Chromiums tillgänglighetsträd (namn,
    expanded, controls, active descendant, listbox, alternativ, selected,
    status och 0 namngivna `generic`);
  - B: pil ned och pil upp;
  - C: Enter;
  - D: Escape och fokus tillbaka till öppnaren;
  - E: antal träffar;
  - F: 0 träffar;
  - G: `aria-expanded`;
  - H: livscykeln för `aria-activedescendant`;
  - I: Tab och Shift+Tab (fält, "Stäng", fält; inga alternativ).

  axe med critical, serious och moderate körs på dialogen i fyra lägen: öppnad,
  sökning, 0 träffar och aktivt alternativ. Alla ger 0 fynd.
- **`keyboard.spec.js`:** de tre GlobalSearch-testerna följer nu den nya
  semantiken (`combobox`, och Tab går till "Stäng" i stället för ett
  alternativ). De kontrollerar fortfarande fokusfälla, Escape och fokusretur.
- **`globalSearchIndex.test.js`:** pilarna utan aktivt alternativ (-1).
- **Negativt bevis:** med alternativen som Tab-stopp igen faller Tab-testet
  (0 väntade, 5 hittade).

**Inte körda:** hela `test:a11y:e2e` och hela Vitest. De körs vid nästa
checkpoint.

## Begränsningar

- Listan visas alltid när dialogen är öppen, eftersom förslag ersätter en
  tom lista. `aria-expanded` blir därför i praktiken falskt bara om det inte
  finns några alternativ alls.
- Statusen uppdateras vid varje tangenttryckning som ändrar antalet. Den
  fördröjs inte.
- Testat i Chromium. Hur skärmläsare (NVDA, VoiceOver och TalkBack) läser upp
  aktivt alternativ och status behöver testas manuellt.
