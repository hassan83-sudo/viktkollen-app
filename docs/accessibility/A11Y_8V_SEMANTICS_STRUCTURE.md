# A11Y-8V: Semantik och sidstruktur

Start: `f202a0c`. `origin/main` har flyttats till `75e52d2` (Cursor, billing).
Det är bara noterat, inget är mergat. Fynden och deras ID kommer från
`A11Y_8T_POST_8S_GAP_AUDIT.md` och, för B2 och B3, från
`A11Y_8M_POST_FIX_AUDIT.md`.

Alla fynd reproducerades före ändringen med Chromiums tillgänglighetsträd och
axe (critical, serious och moderate), i 5 huvudvyer och alla 17 Mer-mappar.

| Fynd | Före | Efter |
|---|---|---|
| **B-8T-N5** Namngivna `generic` | 10 element med `aria-label` men utan roll | 0 i alla 22 vyer. `role="group"` används bara där elementet är en grupp av kontroller. Övriga har ingen `aria-label` (se tabellen nedan). |
| **B-8T-N6** Stora polite-regioner (AI Coach) | Polite-regioner på 316–447 tecken och 12–28 barn. I veckoplanen låg `role="alert"` inuti en polite-behållare. | Ingen live-region över 200 tecken och inga nästlade live-regioner (se nedan) |
| **B-8T-N7** Dubbla h1 | Två identiska h1 i Framsteg, Mat, Må bra, Ekonomi, Teckenspråk, Djurvärlden och Graviditet | Varje vy har en h1: mappens titel från `MoreHub`. Sektionens egen titel är h2, även i Framstegs undermappar. Inget `aria-hidden` används. |
| **B2** Mat, rubrikordning | h1 "Mat" följdes direkt av h3 "Rekommendationer" (axe `heading-order`, moderate) | Ordningen är h1 "Mat", h2 "Mat", h3 "Rekommendationer". Ingen nivå hoppas över, och axe har inga fynd. |
| **B3** Ekonomi, landmärken | Två regioner hette "Ekonomi" (axe `landmark-unique`, moderate) | Aktiveringsrutan är ingen egen region längre, eftersom den är hela innehållet i regionen "Ekonomi". Det finns en region "Ekonomi". |

**B-8T-N5, per element:**

| Element | Åtgärd |
|---|---|
| Hem: "Styr Viktkollen Live" (3 knappar), "Viktiga snabbknappar" | `role="group"` |
| Stället: "Välj ljudmiljö", "Välj avstängningstimer", samt "Välj vän på kartan" i kartan | `role="group"` (knappar med `aria-pressed`) |
| Import & Export: "Valbara exportsektioner" (kryssrutor) | `role="group"` |
| Hem: `.overview-live-meta` "Datum, tid och väder" | Namnet borttaget. Det är informationstext, ingen grupp av kontroller. |
| Redo: `.ready-progress-ring` "0 av 0 klara" | Namnet borttaget. Den synliga texten är identisk. |
| Teckenspråk: `span` "Välj avatar" | Namnet borttaget. Elementet visar vald avatar och är ingen kontroll. |
| Djurvärlden och Graviditet: "Mediaförhandsvisning" | Namnet borttaget. Innehållet är synlig text. |

**B-8T-N6, per komponent:**

| Komponent | Åtgärd |
|---|---|
| `CoachSuggestions` (352 tecken) | `aria-live` borttaget från sektionen. Statusraden är `role="status"`. |
| `AINutritionInsights` (316 tecken) | `aria-live` borttaget från översikten |
| `AdaptiveCoachPanel` (447 tecken) | `aria-live` borttaget från "AI-förslag". Status och fel har redan egna små regioner. |
| `HabitGoalCenter` | `aria-live` borttaget från rutnätet. AI-statusen finns i en liten `role="status"` som alltid finns i DOM:en. |
| `HealthJourneyCenter` | `aria-live` borttaget från rutnätet. AI-statusen har samma lösning. Filtret meddelar "N journey-händelser visas." i en `sr-only`-status. |
| `AdaptiveCoachWeeklyPlan` | Status och fel ligger nu bredvid varandra (`role="status"` och `role="alert"`), inte nästlade |

## Layout

Rubrikerna som ändrats till h2 behåller sitt utseende som h1 genom en regel i
`styles/accessibility.css`. Samma storlekar gäller i alla brytpunkter.

Jämförelse före och efter vid 390 och 320 px, i Hem, Redo, Stället och alla
17 Mer-mappar: rektangel och beräknad font (storlek, vikt, färg, radhöjd) för
alla textelement.
- 32 av 40 vyer är identiska.
- I de övriga 8 skiljer sig bara klockslag, tidsstämplar och slumpade token.
  AI Coach har dessutom den nya `sr-only`-statusen (1 × 1 px).
- Sidhöjden är identisk i alla 40 vyer. Därför behövs inga skärmdumpar.

## Tester

- **`tests/a11y/semantics-8v.spec.js`**, nytt, 6 tester:
  - strukturgate i 5 huvudvyer och 17 Mer-mappar: 0 namngivna `generic`
    (C-8T-N2), exakt en synlig h1 och unika regionnamn;
  - grupperna är riktiga grupper, och Redo-ringen har inget eget namn;
  - AI Coach: ingen live-region över 200 tecken och ingen nästlad. Filtret
    meddelas i exakt en region.
  - Mat: rubrikordningen, och axe med moderate;
  - Ekonomi: en region, och axe med moderate.
- **`more-folders.spec.js`:** moderate-gaten gäller nu också Framsteg, Mat, Må
  bra, Ekonomi, Teckenspråk, Djurvärlden, Graviditet och Import & Export.
- **Uppdaterade komponenttester:**
  - `HabitGoalCenter.test.jsx`: rutnätet är inte live, och AI-statusen är
    `role="status"`.
  - `ProgressHub.test.jsx`: `<h2>Framsteg</h2>`.
- **Negativa bevis:**
  - **A:** med Mats h1 tillbaka faller strukturgaten ("one visible h1",
    `["Mat","Mat"]`) och rubriktestet.
  - **B:** med `aria-live` tillbaka på `.insight-plan` faller live-testet
    ("live region over 200 characters", 447 tecken).

**Inte körda i denna sprint:** hela `test:a11y:e2e` och hela Vitest. De körs
vid nästa checkpoint.

## Observationer (inte ändrade)

- **Import & Export:** `.analysis-list` är en polite-region på 178 tecken. Den
  ligger under gränsen och ingick inte i 8T-fyndet.
- **Oanvända översättningsnycklar:** `liveMetaAria`, `media.previewAria` och
  `checklist.progress` används inte längre. De ligger kvar, och
  `i18n:check` är OK.
