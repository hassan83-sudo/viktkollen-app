# A11Y-8U — Snabbfixar efter 8T

Start: `f7eaecc`. `origin/main` har flyttats till `cbea3e1` (Cursor). Det är
bara noterat, inget är mergat. Fynden och deras ID kommer från
`A11Y_8T_POST_8S_GAP_AUDIT.md`.

| Fynd | Före | Efter |
|---|---|---|
| **B-8T-N1** Fokus till `<body>` | AI Coach "Markera sedd" → `BODY`. Redo "Ja, radera" → `BODY`, eftersom dialogen återför fokus till den raderade radens knapp, som tas bort direkt efter. | **AI Coach:** fokus går till badge-kortet (`tabIndex=-1`, synlig ram). **Redo:** fokus går till nästa rads "Radera", annars föregående rads, annars fältet "Lägg till sak". Fokus flyttas bara om knappen hade fokus (i AI Coach) eller om raderingen bekräftades i dialogen (i Redo). |
| **B-8T-N2** Må bra, sidledsscroll | 32 px vid 320 px, 98 px vid 320 px med extra stor text, och 28 px vid 390 px med extra stor text. `.wellbeing-accordion-trigger-meta` hade `flex-shrink: 0` och trängde ut plus/minus-ikonen och texten. | **0 px** i alla tre lägena. Metatexten får krympa och radbrytas. |
| **B-8T-N3** Hem, klippt råd | `-webkit-line-clamp: 4` klippte rådet vid extra stor text och 320 px (122 px innehåll mot 91 px synligt) | Vid förstorad text (`large` och `extra-large`) har rådet och notistexten ingen `line-clamp`, så hela texten syns. Normal textstorlek är oförändrad. |
| **B-8T-N4** 65+, tomt formulär | "Lägg till" med tomt eller blankt namn gjorde ingenting | Samma mönster som Redo (8Q): meddelandet "Skriv namnet på medicinen innan du lägger till." i en polite statusregion som alltid finns i DOM:en. Fältet får `aria-invalid` och `aria-describedby`, fokus stannar där formuläret skickades från, och allt försvinner när texten ändras. |
| **B-8T-N8** "Ring 112" | Inline-länk på 81 × 19 | `inline-block` med `min-height: 24px` och 3 px utfyllnad uppe och nere: 81 × 25. Den ser ut som tidigare men är 6 px högre. Kanterna träffar länken själv, och fokus syns. |
| **C-8T-N1** Mer-gaten | Reflow bara vid 390 px normalt | Alla 17 mappar kontrolleras vid 390 px, 320 px och 320 px med extra stor text och stora kontroller |

## Ändrade filer

- `src/components/AchievementCenter.jsx`: kortet får `ref` och `tabIndex=-1`,
  och fokus flyttas dit efter "Markera sedd".
- `src/components/sections/ReadySection.jsx`: fokus efter bekräftad radering.
- `src/features/senior/SeniorEverydaySection.jsx`: feltext och
  statusregion. Filen har hårdkodad svenska redan, så feltexten följer den.
- `src/styles/accessibility.css`:
  - fokusram på badge-kortet;
  - Må bra-raden;
  - Hem-texterna utan `line-clamp` vid förstorad text;
  - stil för `.form-feedback-error`;
  - "Ring 112".
- `tests/a11y/more-folders.spec.js`: reflow vid 320 px och vid 320 px med
  extra stor text.
- `tests/a11y/quick-fixes-8u.spec.js`: nytt, 5 tester.

## Tester (riktade)

- `quick-fixes-8u.spec.js`, 5/5:
  - AI Coach-fokus;
  - Redo-fokus för mittersta, sista och enda raden;
  - Hem-texterna vid extra stor text och 320 px;
  - 65+-formuläret (tomt, blankt, korrigering);
  - "Ring 112" (träffyta, kanter och fokus).
- `more-folders.spec.js` reflow, 18/18: täckning och 17 mappar i tre lägen.
- Berörda regressioner, 27/27: `ai-coach`, `feedback-status-focus`,
  `targets-large-text`, `forced-colors` och `quick-fixes-8u`.
- Komponenttester för AchievementCenter, Ready, Senior, Wellbeing, Education
  och MoreSection: 45 godkända. De 2 fel som finns i `ReadySection.test.jsx`
  ingår i baslinjen.
- `test:a11y` 487/487. i18n, hardcoded (0), build, `git diff --check` och lint
  för de ändrade filerna är OK.
- **Negativt bevis:** utan Må bra-regeln faller den nya 320 px-kontrollen
  (32 px). Det visar både fixen och gaten.

**Inte körda i denna sprint:** hela `test:a11y:e2e` och hela Vitest. De körs
vid nästa checkpoint.

## Skärmdumpar (granskade)

- **Må bra vid 320 px och 320 px med extra stor text:** före ställdes
  rubriken "Frivillig check-in" upp en bokstav per rad, och metatexten låg
  utanför skärmen. Efter fixen syns rubrik, metatext och ikon.
- **Hem med extra stor text:** hela rådet syns.

## Observationer (inte ändrade)

- **Må bra vid extra stor text och 320 px:** rubriken bryts mitt i ett ord
  ("Frivilli-g") när metatexten tar plats bredvid den.
- **Må bra vid extra stor text och 320 px:** kryssrutornas etiketter
  ("Nedstämdhet") är nära grannkolumnen.
- **Hem vid extra stor text:** rubriken "Dagens råd" bryts mitt i ett ord i
  det smala kortet.

Detta bör ses över vid nästa stortextgenomgång.
