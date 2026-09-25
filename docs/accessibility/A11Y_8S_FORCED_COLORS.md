# A11Y-8S — Forced colors (Windows kontrastteman)

Start: `d90bea6` (efter 8R). `origin/main` står kvar på `9d6f1b2`, som i 8R.

| Fynd | Status efter 8S |
|---|---|
| B11: inget stöd för forced colors (1.4.1, 1.4.11, 1.3.1) | **FIXED** i Chromium-emulering. Manuell test i Windows återstår, se nedan. |

## Hur forced colors beter sig (Chromium, uppmätt)

`page.emulateMedia({ forcedColors: 'active' })` används, och
`matchMedia('(forced-colors: active)')` är då sant. Beräknade stilar
redovisas efter tvingningen:

- Bakgrunder blir Canvas, men alfa behålls. En "aktiv" bakgrund
  (`rgb(255, 255, 255)`) och en genomskinlig ser därför likadana ut.
- Gradienter blir `background-image: none`, och `box-shadow` blir `none`.
- Färg på text, kanter och outline blir systemfärger: CanvasText, ButtonText
  och LinkText.
- Systemfärger som författaren anger (`Highlight`, `CanvasText`) behålls. Därför
  behövs `forced-color-adjust` ingenstans, och den används inte.

## Inventering före (alla huvudvyer och alla 17 Mer-mappar)

| Område | Resultat före |
|---|---|
| **Fokus** | OK. Varje Tab-stopp i 23 vyer har en outline. Enda undantaget är det kända Molnbackup-fyndet (A-N4, Cursor). |
| **Valt tillstånd** | **Syntes bara som bakgrund**, se tabellen nedan |
| **Progress** | **Osynlig:** Nivåprogress och Nutrition Coach Center (`role="progressbar"`) samt badge-staplarna. Varken spår eller fyllnad syntes, eftersom gradienten togs bort och det saknades kant. |
| **Live-flödets prickar** | Osynliga (bara bakgrund). Dekorativa och `aria-hidden`. |
| **Kort och status** | OK: Hem-korten, Redo-plattorna och korten, Mat-korten, AI Coach-korten, badges, sociala kort, väderstatus och bottennavigeringen har kanter. |
| **Dialog** | OK: Redo-dialogen har kant, och AI Coach-dialogen täcker hela skärmen. Bakgrundsdämpningen försvinner, men rutan är avgränsad. |
| **Formulär och fel** | OK: fälten har kant, och Redo-felet är text med `aria-invalid`. |
| **Kryssrutor och `summary`** | OK: native, systemritade. |

**Valda tillstånd som bara syntes som bakgrund:**
- aktiv länk i bottennavigeringen (`aria-current="page"`) i alla sektioner;
- AI Coach, chipet "Alla" (`aria-pressed`);
- Stället: "Regn", "15 minuter" (`aria-pressed`) och fliken "Stället"
  (`role="tab"`, `aria-selected`);
- Tillgänglighet, alternativkortet "Normal" (`aria-pressed`);
- Min resa, segmentet "Översikt". Det hade bara klassen `active`, så inte ens
  hjälpmedel fick veta vilken vy som var vald (1.3.1).

**Ikoner och SVG:**
- Navigeringsikonerna och Hem-ikonerna följer `currentColor` och syns.
- Mat-ringarna (SVG, `aria-hidden`) visar sitt värde även som text.
- Redo-ringen visar "0 av 0 klara" som text.
- Body Scan-ringarna är Cursor-ägda och inte ändrade.

## Efter

Alla regler ligger i `styles/accessibility.css` under
`@media (forced-colors: active)`. De påverkar alltså inte vanlig rendering.

- **Valt tillstånd.** Nav-länk med `aria-current="page"`, `[aria-pressed="true"]`,
  `[role="tab"][aria-selected="true"]` och `[role="option"][aria-selected="true"]`
  får:
  - en inre ram, `outline: 2px solid Highlight` med `outline-offset: -4px`,
    utan layoutpåverkan;
  - understrykning, 2 px.

  Ramen gäller bara `:not(:focus-visible)`. När objektet har fokus visas
  fokusringen i stället, och understrykningen visar fortfarande valt tillstånd.
- **Min resa (`JourneySection.jsx`).** Segmenten har fått `aria-pressed` och
  gruppen `role="group"`. Det valda segmentet är därmed programmatiskt och får
  samma markering. (I appens eget högkontrastläge syns nu också den befintliga
  understrykningen för `aria-pressed`.)
- **Progress.** Spåret får `1px solid CanvasText` och fyllnaden `Highlight`.
  Det gäller `.achievement-progress`, `.nutrition-coach-progress-bar`,
  `.report-progressbar` och `.achievement-preview-progress`.
- **Prickar.** `CanvasText`. Den aktiva pricken är bredare (12 px mot 5 px),
  så positionen syns.

## Tester

`tests/a11y/forced-colors.spec.js` innehåller 6 Chromium-tester med
forced-colors-emulering. De läser beräknade stilar, semantik och
rektanglar, inte pixlar.

1. **Bottennavigeringen:** i alla sex sektioner skiljer sig den aktuella länken
   från sina syskon i egenskaper som överlever forced colors (kant, outline,
   dekoration, vikt, färg). Bakgrund räknas inte. Fokusringen på den aktuella
   länken skiljer sig från markeringen för valt tillstånd.
2. **Fokus:** varje Tab-stopp i Hem, Redo, Min resa, Mat, AI Coach och Må bra
   har en synlig indikator (8N-gaten under forced colors).
3. **Valda tillstånd** i Min resa (inklusive `aria-pressed`), Stället, AI Coach
   och Tillgänglighet.
4. **Progress, kanter och kontroller:**
   - progress har spår och fyllnad;
   - viktiga kort och statusfält har kant på fyra sidor;
   - prickarna ritas och den aktiva är bredare;
   - Redo-felet är text och `aria-invalid`;
   - kontrollernas text skiljer sig från Canvas.
5. **Dialog:** kant på fyra sidor, fokus inuti med outline (öppnad med
   tangentbordet), och Escape stänger.
6. **Axe i forced colors:** blockerar på critical, serious och moderate för
   Hem, Redo och AI Coach, med regeln `color-contrast` avstängd. Motivering:
   den läser författarens färger och rapporterade "Online" som #5cff9a på vitt
   (1,29:1), medan Chromium ritar texten svart. Test 4 kontrollerar i stället
   de faktiska tvingade textfärgerna.

## Negativa bevis (alla återställda)

- **A:** utan `:not(:focus-visible)` ersätter markeringen fokusringen
  (`solid 2px -4px` i båda lägena), så navigationstestet faller.
- **B:** utan markeringen för valt tillstånd faller navigationstestet och
  tillståndstestet ("⌂ Hem looks like its unselected sibling").
- **C:** utan progress-spåret faller testet med "Nivåprogress: no visible
  track", och likadant för Kalorier, Protein och badge-staplarna.

## Skärmdumpar (forced colors, granskade)

- **Före:** aktiv nav, "Översikt", "Alla", "Regn", "15 minuter", fliken
  "Stället" och "Normal" såg ut som sina syskon. Nivåprogress syntes inte.
- **Efter:** alla har en inre ram och understrykning, och progress har spår och
  fyllnad.
- **Oförändrat och läsbart:** kort, kanter, knappar, länkar (LinkText),
  kryssrutor, dialog och fokusringar.

## Vanliga lägen

Standard, appens högkontrast, stor text och 320 px jämfördes före och efter i
Hem, Redo, Min resa, Stället och AI Coach. Resultatet är 0 ändrade pixlar,
utom i högkontrastläget för Min resa: där syns den befintliga understrykningen
under "Översikt" (94 px), eftersom segmentet nu har `aria-pressed`.

## Begränsningar i automatisk test

- Emuleringen använder Chromiums standardtema (vit Canvas, svart text,
  mörkblå Highlight). Riktiga Windows-teman ("Öken", "Skymning", "Vattenfall"
  och "Nattsvart" i Windows 11) har andra färger.
- Webbläsare utanför Chromium (Firefox har egen forced colors-implementering)
  är inte testade.
- Axes kontrastregel kan inte användas i forced colors.
- Pixlar testas inte, eftersom sådana tester blir beroende av Chromium-version.

## Kräver manuell test i Windows

- Windows 11 kontrastteman (minst "Nattsvart" och "Öken") i Edge och Chrome:
  - navigeringens aktiva länk, chips och flikar ser valda ut;
  - fokusringen syns ovanpå markeringen för valt tillstånd;
  - progressbars (AI Coach) har spår och fyllnad;
  - Live-flödets prickar syns;
  - dialogen är avgränsad;
  - emojiikonerna (📍, 🛋 m.fl.) och bilderna på Hem-korten syns som de ska.
- Firefox med kontrastteman.
