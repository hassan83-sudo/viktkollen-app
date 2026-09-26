# A11Y-8Z4: CI för tillgänglighet (C12)

Start: `ddc1314`. `origin/main` står på `b6814d3` (Cursor, billing). Det är
bara noterat, inget är mergat. Ingen kod under `src/` är ändrad.

## CI före ändringen

Det fanns ingen CI, varken på den här grenen eller på `origin/main`:
- ingen `.github/`;
- ingen GitLab-, Circle- eller Azure-konfiguration;
- ingen annan CI-konfiguration i repot.

Det enda som liknar CI är `vercel.json`, som gäller deploy. Där körs inga
tester.

De npm-skript som redan fanns:

| Skript | Vad |
|---|---|
| `test:a11y` | Vitest (jsdom), 515 tester i 39 filer |
| `test:a11y:e2e` | Playwright med `playwright.a11y.config.js`, 261 tester i Chromium |
| `i18n:check` och `i18n:hardcoded` | Kontrollerar i18n-nycklarna och hårdkodad UI-text |
| `test` | Hela Vitest. Har 96 kända fel i baslinjen. |
| `build` och `lint` | Lint har 51 kända problem i baslinjen |

Playwright-konfigurationen var redan förberedd för CI:
- `forbidOnly` och `reuseExistingServer` följer `CI`;
- en worker och 0 omkörningar;
- Vite startas som dev-server mot en lokal Supabase-URL som aldrig kontaktas;
- alla Supabase-anrop avbryts;
- inga hemligheter behövs.

## Vad som lades till

1. **`.github/workflows/accessibility.yml`**, ett nytt workflow ("Accessibility")
   med två jobb.
2. **`npm run test:a11y:e2e:fast`**, ett nytt npm-skript för den snabba
   delmängden i Chromium. Samma kommando körs lokalt och i CI.

Inga nya beroenden och inga uppgraderingar. `@playwright/test` 1.62.1 och
`axe-core` fanns redan.

## Triggers och jobb

| Jobb | När | Vad körs | Tid (lokalt) |
|---|---|---|---|
| **fast** ("Accessibility gate (fast)") | `push` och `pull_request` som ändrar appen eller testerna. `workflow_dispatch` med valet `fast`. | `test:a11y`, `i18n:check`, `i18n:hardcoded` och `test:a11y:e2e:fast` (65 tester i Chromium) | cirka 35 s + 4 min, plus installation |
| **full** ("Accessibility E2E (full)") | Manuellt (`workflow_dispatch` med valet `full`, som är standard) och varje måndag 03:17 UTC | samma kontroller och hela `test:a11y:e2e` (261 tester) | cirka 35 s + 20 min, plus installation |

**Sökvägsfilter för push och PR:**
- `src/**` och `tests/a11y/**`;
- i18n-skripten;
- `index.html` och `public/**`;
- `package.json` och `package-lock.json`;
- `vite.config.js` och `playwright.a11y.config.js`;
- workflowfilen själv.

En push med bara dokumentation eller billing-skript startar därför inget
jobb.

**Övrigt:**
- Behörighet: `contents: read`.
- `concurrency` avbryter en äldre körning på samma gren.
- Tidsgränser: 25 minuter för fast och 60 för full.
- Vid fel laddas `test-results/`, med Playwright-spår, upp som artefakt.

### Den snabba delmängden i Chromium (65 tester)

| Spec | Täcker |
|---|---|
| `axe-views` (24) | axe med critical, serious och moderate i alla huvudvyer, i fyra lägen: normal, zoom, 320 px och stor text |
| `keyboard` (10) | tangentbordsflöden, även dialoger och GlobalSearch |
| `label-in-name` (9) | WCAG 2.5.3 och unika landmärken |
| `landmarks` (2), `semantics-8v` (6) | struktur, rubriker och live-regioner |
| `tabs-keyboard` (2) | flikmönstret i Stället och Ekonomi |
| `global-search` (4) | combobox och listbox |
| `place-cards` (8) | aktivering, målstorlek och axe på Plats-korten |

Det som bara körs i den fulla sviten:
- de 17 Mer-mapparna (69 tester);
- fokus i fyra lägen;
- forced colors och högkontrast;
- zoom och reflow;
- alla dialogspecar (8X);
- `gaps-8z3`;
- alarm och rörelse.

**Skillnad:** den snabba delmängden är ungefär en fjärdedel av testerna och en
femtedel av tiden, 4 minuter mot 20.

## Chromium och miljö

- **Webbläsare:** `npx playwright install --with-deps chromium` installerar den
  Chromium-revision som `@playwright/test` i `package-lock.json` pinnar (1.62.1
  ger Chrome for Testing 151.0.7922.34, revision 1234). Systemberoendena
  installeras också.
- **Beroenden:** `npm ci` följer lockfilen. Verifierat lokalt: 246 paket
  installerades på 7 sekunder.
- **Miljö:** Node 22 och `ubuntu-24.04`. `TZ=UTC`, som lokalt. E2E-sviten
  sätter själv `sv-SE` och `Europe/Stockholm`.
- **Lokalt:** den här miljön har en förinstallerad äldre Chromium (revision
  1194). Den används via `A11Y_CHROMIUM_EXECUTABLE`, som konfigurationen redan
  stöder. I CI sätts variabeln inte, så den pinnade revisionen används.

## Baslinjer

- **Hela Vitest körs inte i CI.** Den har 96 kända fel i baslinjen (8Y och
  8Z3), och en sådan gate skulle alltid vara röd. Felen är inte ändrade.
- **Lint körs inte i CI** av samma skäl: 51 kända problem.
- **`build` körs inte separat.** Det fanns ingen tidigare CI att dubblera, och
  E2E-sviten startar ändå Vite och kompilerar allt den besöker.
- De kontroller som körs var gröna vid 8Z3 och är gröna nu:
  - `test:a11y`: 515 av 515;
  - `i18n:check`: OK;
  - `i18n:hardcoded`: 0;
  - den snabba delmängden: 65 av 65;
  - hela sviten: 261 av 261.
- Gaten kan alltså vara grön med dagens verifierade baslinje. De kända
  undantagen i specarna (Molnbackup och Body Scan, som är Cursor-ägda) har
  redan kontroller som faller när ett undantag inte längre reproduceras.

## Så körs det

- **Automatiskt:** vid push och PR som ändrar sökvägarna ovan.
- **Manuellt:** GitHub → Actions → Accessibility → Run workflow. Välj gren och
  `full` (standard) eller `fast`.
- **Lokalt, med samma kommandon:**

  ```sh
  npm ci
  npm run test:a11y && npm run i18n:check && npm run i18n:hardcoded
  npx playwright install --with-deps chromium
  CI=true npm run test:a11y:e2e:fast   # eller: CI=true npm run test:a11y:e2e
  ```

## C12: slutstatus

Se avsnittet "C12" i slutrapporten för 8Z4. Status och eventuell körning på
GitHub fylls i där.
