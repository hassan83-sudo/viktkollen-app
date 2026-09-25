# A11Y-8R — Träffytor och stor text

Start: `e955e6f` (efter 8Q). `origin/main` har flyttats till `9d6f1b2`
("account deletion: integrate atomic purge orchestrator", Cursor-ägt). Det är
bara noterat, inget är mergat.

| Fynd | Status efter 8R |
|---|---|
| B5 Hem: "Visa fler råd" och "Visa alla" 14 px (2.5.8) | **FIXED** |
| B8 Redo: plattor med ellips och klippning (1.4.4, 1.4.10) | **FIXED** |
| B-N2 Kryssrutor 20–22 px (2.5.8) | **FIXED** (Må bra). Övriga har redan en tillräcklig träffyta. |
| B-N3 `summary` 19 px (2.5.8) | **FIXED** |

Träffytan mäts med Chromiums rektanglar för det element som faktiskt tar emot
klicket. För en kryssruta i en `<label>` är det etiketten, eftersom ett klick
på etiketten kryssar i rutan. Punkterna 1 px innanför övre och undre kanten
måste träffa kontrollen själv (`elementFromPoint`), så att ingen annan kontroll
täcker den förstorade ytan.

## B5 — Hem

**Grundorsak.** En gemensam regel i Hem-designen (`App.css`,
`#app-section-home.is-active .daily-coach-more, … .smart-notifications-meta
.secondary-button`) sätter `min-height: 0` och `padding: 0`, så att båda ser ut
som textlänkar.

| Kontroll | Komponent | Före | Efter | Närmaste annan kontroll |
|---|---|---|---|---|
| "Visa fler råd" | `DailyCoachCard` (button) | 148 × 14 | 148 × 24 | 86 px |
| "Visa alla" | `SmartNotificationsCard` (button) | 56 × 14 | 56 × 24 | 117 px |

Axe godkände båda redan före ändringen via avståndsundantaget (`target-size`: 0
fynd). Det är därför en egen gate behövs.

**Fix.** Båda får `min-height: 24px` och 5 px `padding` uppe och nere. Den
extra utfyllnaden tas tillbaka från marginalerna:

- "Visa fler råd" har `margin-top: 12px`. Den blir 7 px uppe och −5 px nere,
  så att 7 + 24 − 5 = 12 + 14.
- "Visa alla" är centrerad i en rutnätsrad utan marginal och får
  `margin-block: -5px`.

Texten ligger därför exakt kvar: 0 ändrade pixlar i standard och högkontrast.
Med stora kontroller är båda redan 44 px, så ingen kompensation behövs där.

## B-N2 — kryssrutor

Alla kryssrutor är native `<input type="checkbox">` i en `<label>`. Den
synliga rutan är 20–22 px. Träffytan är etiketten.

| Vy | Rutor | Etikett (träffyta) före | Efter | Åtgärd |
|---|---|---|---|---|
| Må bra (skäl: Stress, Oro …) | 7 | **160 × 22** | 160 × 24 | `.wellbeing-reasons label { min-height: 24px }` |
| Mat (check-in) | 5 | 332 × 28 och 360 × 32 | oförändrad | ingen, redan ≥ 24 |
| Teckenspråk | 2 | 333 × 28 och 333 × 32 | oförändrad | ingen |
| Import & Export | 12 | 308 × 28 till 336 × 32 | oförändrad | ingen |
| AI Coach | 4 | 336 × 44, 336 × 32, 310 × 28 | oförändrad | ingen |
| Plats (samtycke) | 1 | 320 × 44 | oförändrad | ingen |

Den synliga rutan är inte ändrad. Inga nästlade interaktiva element har
tillkommit. Notis hade inga kryssrutor i testmiljön.

## B-N3 — `summary`

| Kontroll | Komponent | Före | Efter |
|---|---|---|---|
| "Varför detta råd?" | `AICoach.jsx` (native `details` / `summary`) | 284 × 19 | 284 × 25 |
| "Varför visas detta?" | `AINutritionInsights.jsx` | 306 × 19 | 306 × 25 |

Fixen är `min-height: 24px` och 3 px `padding` uppe och nere. Den native
semantiken är kvar: expanded/collapsed via `details[open]`, Enter och Space
fäller ut. Alla `summary` i AI Coach-mappen är nu minst 24 px. Summaryn i
Inställningar ("Jämför abonnemang", "Radera konto och data") är Cursor-ägda
och inte ändrade.

## B8 — Redo-plattor

**Före** (Chromium):

- **"Inget planerat ännu"** (`.ready-info-tile-copy span`, `white-space:
  nowrap`, ellips) klipptes redan vid normal textstorlek. Med extra stor text
  var texten 146 px bred men fick bara 110 px.
- **"Minnesträning"** (`.ready-action-tile strong`) låg vid extra stor text och
  390 px på x 246–383. Plattan gick till 370, så ordet klipptes av
  `.ready-shell` (`overflow-x: clip`). Samma sak gällde vid stor text och
  390 px.

**Fix:**

- Infoplattans text får radbrytas (inte längre `nowrap` eller ellips), och
  plattan blir högre.
- Vid förstorad text (`data-a11y-text-size` large eller extra-large) får
  snabbåtgärderna två kolumner. Appen gör redan så under 375 px.
- Ord bryts inte, eftersom det gav fula brytningar ("Minnesträni-ng") även där
  ordet fick plats.

**Efter.** Ingen ellips, ingen klippning och ingen text utanför sin platta
eller sidan i något av lägena:

- standard 390 px;
- 320 px;
- 200 % zoom (640 × 400, dsf 2);
- stor text vid 390 px;
- extra stor text vid 390 och 320 px.

Sidledsscrollen är 0 i alla lägen.

Den dekorativa emojin 🤖 i avatarknappen sticker ut 5 px vid stor text. Den är
`aria-hidden` och ingen text, så den ligger utanför B8 och är inte ändrad.

## Tester

`tests/a11y/targets-large-text.spec.js` innehåller 9 Chromium-tester:

- **Hem:**
  - båda knapparna har en träffyta på minst 24 × 24 och inga täckta kanter;
  - Tab, Shift+Tab och synligt fokus fungerar;
  - Enter och Space byter råd;
  - axe blockerar på moderate.
- **Kryssrutor:** alla etiketter i Må bra, Mat, Teckenspråk, Import & Export,
  AI Coach och Plats är minst 24 × 24. I Må bra växlar Space rutan och fokus
  syns. Axe blockerar på moderate.
- **AI Coach:**
  - de två summaryna, och alla andra i mappen, är minst 24 px;
  - Enter öppnar och Space stänger;
  - fokus syns;
  - axe blockerar på moderate.
- **Redo** (sex lägen): ingen ellips, ingen klippning (textens bredd mäts med
  en Range, eftersom `scrollWidth` avrundas och missar ellips under en pixel),
  ingen text utanför plattan eller sidan, och ingen sidledsscroll. Axe
  blockerar på moderate vid extra stor text.

Axe med `target-size` explicit: 0 fynd både före och efter på Hem, Redo, Må bra
och AI Coach, i standard och vid stor text. Det finns inga fynd på moderate
eller högre i dessa vyer.

## Negativa bevis (alla återställda)

| Bevis | Utan regeln | Test som faller |
|---|---|---|
| A | B5: "Visa fler råd" 148 × 14, "Visa alla" 55,8 × 14 | Hem-testet |
| B | B-N2: Må bra-etiketterna 160 × 22 (alla 7) | kryssrutetestet |
| C | B-N3: 284 × 19 och 306 × 19 | AI Coach-testet |
| D | B8: ellips på "Inget planerat ännu" i standardläge, vid stor text och vid extra stor text. "Minnesträning" utanför plattan och klippt av sidan. | Redo-testet i tre av sex lägen. Vid 320 px och 200 % får texten redan plats. |

## Visuella skillnader

Jämförelsen gjordes i standard, högkontrast, extra stor text vid 390 px och
extra stor text vid 320 px.

| Vy | Skillnad |
|---|---|
| Hem (båda korten) | 0 pixlar i alla lägen. Bara knapparnas träffyta växer. |
| Redo, snabbåtgärder | 0 pixlar i standard, högkontrast och 320 px. Vid extra stor text och 390 px: två kolumner (98 → 171 px höjd). |
| Redo, infoplattor | +5 till 7 px: "Inget planerat ännu" syns hela på två rader i stället för med ellips. Vid 320 px: 0. |
| Må bra | +8 px, eftersom etiketterna går från 22 till 24 px. Vid stor text: 0, eftersom de redan var 44 px. |
| AI Coach (två kort) | +6 px per kort (summary 19 → 25). Vid stor text flyttas texten 3 px inom den redan 44 px höga summaryn. |

## WCAG-undantag

Inga. Alla berörda kontroller har nu en verklig träffyta på minst 24 × 24.
Avståndsundantaget i 2.5.8 (som axe godkände före 8R) används inte.
