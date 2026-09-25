# A11Y-8P — Mat: reflow och import av mathistorik

Start: `4237f48` (efter 8O). Gäller 8M A-N1 och 8N A-N6. Rapporterna från 8M
och 8N är historiska och är inte ändrade.

| Fynd | Status efter 8P |
|---|---|
| A-N1 Mat reflow (WCAG 1.4.10) | **FIXED** |
| A-N6 Importera mathistorik, tangentbord (WCAG 2.1.1) | **FIXED** |

## A-N1 — reflow

### Grundorsak

`.nutrition-actions` får `flex-wrap: wrap` från basregeln i `App.css`. Två
mediaregler lägger sedan till var sin sak:

- vid högst 900 px blir den en kolumn (`flex-direction: column`);
- vid högst 560 px får knapparna `flex: 1 1 100%`.

I en kolumn som får radbrytas räknas `flex-basis: 100%` mot kolumnens höjd.
Varje knapp startar då en ny kolumn till höger. Den andra knappen hamnar
utanför sidan, precis intill den första: x = 38 + 314 + 10 i mellanrum =
362 px vid 390 px bredd. Den första knappen sträcks samtidigt till 96 px höjd.

Samma grundorsak gäller alla `.nutrition-actions` med minst två knappar, inte
bara "Dölj".

### Före (Chromium, `scrollWidth − clientWidth`)

| Vy | 390 px | 320 px | Element utanför sidan (vid 390 px) |
|---|---|---|---|
| Översikt (rekommendationer) | **286** | **216** | "Dölj" ×2, x 362–676 |
| Näringsmål | **665** | **525** | "Avbryt", "Återställ mål", "Nästa vecka", x 373–1055 |
| Import, recension och mer | **665** | **525** | "Avbryt", "Rensa", "Välj säkerhetskopia" |
| Planera dagen | **280** | **210** | "Avbryt", "Kopiera inköpslista", "Rensa inköpslista" |
| Lägg till måltid | **319** | **249** | "Återställ formulär" |
| Favoriter, Streckkod, Historik, Recept, Skanna mat | 0 | 0 | – |

- Stor text gav samma värden (286 vid 390 px och 216 vid 320 px).
- Vid desktop (1280 px) och 200 % zoom (640 × 400) var overflow 0, eftersom
  regeln för 560 px inte gäller där.

### Fix

`styles/accessibility.css`: vid högst 900 px får `.nutrition-actions`
`flex-wrap: nowrap`. En kolumn behöver aldrig radbrytas, så knapparna staplas
under varandra i sitt kort. Ingen global regel ändrades.

### Efter

| Läge | Overflow i alla 10 Mat-vyer |
|---|---|
| 390 px | 0 |
| 320 px | 0 |
| 200 % (640 × 400, dsf 2) | 0 |
| Stor text + stora kontroller, 390 och 320 px | 0 |
| Desktop 1280 px | 0 (oförändrat) |

Ingen kontroll ligger utanför sidan, och ingen text i rekommendationskorten
eller knappraderna klipps. "Dölj" ligger inne i sitt eget kort under "Varför?".
Med tangentbordet (Enter) döljer den just det kortet.

## A-N6 — Importera mathistorik

**Före.** `MealHistoryTools.jsx` hade en `<label class="secondary-button">`
runt en `<input type="file" style="display: none">`. En etikett kan inte ta
fokus, och en input med `display: none` inte heller. Tangentbordet hade därför
inget mål: Tab gick direkt från "Exportera mathistorik" till "Rensa
mathistorik". Bara mus- och touchklick på etiketten fungerade.

**Efter.** En riktig `<button>` "Importera mathistorik" anropar
`fileInputRef.current.click()`. Inputen har `sr-only`, `tabIndex={-1}` och
`aria-hidden="true"`, samma mönster som i 8N. `accept`, `onChange` och hela
importflödet (`importMealHistory`) är oförändrade. Inputen har aldrig haft
`multiple`.

### Tillgänglighetsträdet i Chromium

| | Före | Efter |
|---|---|---|
| Synlig kontroll | `LabelText`, inget namn, inte fokuserbar | `button` "Importera mathistorik från JSON", focusable = true |
| Native input | ignored (notRendered, `display: none`) | ignored (ariaHiddenElement), inte ett Tab-stopp |
| Tab efter "Exportera mathistorik" | "Rensa lokal mathistorik" | "Importera mathistorik från JSON" → "Rensa lokal mathistorik" |

Namnet börjar med den synliga texten (2.5.3), precis som "Exportera
mathistorik som JSON" bredvid.

## Tester

- **`tests/a11y/mat-reflow.spec.js`** (10 tester): 390 px, 320 px, 200 % och
  stor text vid 390 och 320 px. För översikten och fem paneler kontrolleras:
  - ingen sidledsscroll;
  - ingen kontroll utanför sidan;
  - ingen klippt text.

  Den kontrollerar också att "Dölj" syns, ligger helt inne i sitt eget kort,
  och döljer just det kortet med Enter.
- **`tests/a11y/more-folders.spec.js`:** Mer-gaten kontrollerade inte
  sidledsscroll. Därför klarade fokusgaten Mat trots A-N1, eftersom "Dölj"
  började vid 362 px, innanför 390. Nu ingår en reflow-kontroll för alla 17
  mappar vid 390 px. Ingen baseline finns för A-N1 eller A-N6.
- **`tests/a11y/hidden-file-input.spec.js`:** nytt test för "Importera
  mathistorik". Det kontrollerar Tab, synligt fokus, att nästa stopp klarar
  8N-gaten, namnet, att Enter, Space och klick var för sig öppnar exakt en
  filväljare, och att en mockad tom exportfil går vidare till importflödet
  ("Import klar: 0 importerade …").

## Negativa bevis (alla återställda)

- **A:** med gamla CSS:en faller Mat-reflow vid 390 och 320 px ("page scrolls
  286 px", "Dölj" 362–676, "Näringsmål 665 px" …), och Mer-gaten faller för Mat.
- **B:** med gamla `<label>` finns ingen knapp, så importtestet faller.
- **C:** en tabbbar dold input gör att 8N-detektorn fäller nästa Tab-stopp
  (`input[type=file]: self-visually-hidden`).

## Visuella skillnader

| Vy | Desktop | 390 / 320 / högkontrast / stor text |
|---|---|---|
| Rekommendationer | 0 pixlar, 0 geometriändringar | 4 av 29 rutor ändras: "Dölj" flyttar från x 362 till x 38 under "Varför?". "Varför?" går från 96 till 42 px höjd, eftersom den inte längre sträcks. Allt annat är oförändrat. |
| Mathistorik | Importkontrollen har nu samma knappstil (rundad) som syskonknapparna. Kortet växte 38 px. | Samma: knappstil, 25–51 px bredare. Den dolda inputen är osynlig och ligger utanför flödet. |

Ändringen behövs eftersom knapparna annars ligger utanför sidan. Importen måste
vara en riktig knapp för att tangentbordet ska kunna nå den.

## Observationer (inte ändrade)

- **Mathistorikpanelen på desktop:** vid 1280 px är verktygskortet bara 112 px
  brett, så knapptexterna bryts ("Expor­tera"). Det gällde redan före 8P, ger
  ingen sidledsscroll och ligger utanför A-N1.
- **Fokus efter "Dölj":** när ett rekommendationskort döljs försvinner den
  fokuserade knappen, och fokus faller tillbaka till `<body>`. Det är en
  fokusfråga av B-typ (2.4.3) för en senare sprint.
