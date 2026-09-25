# A11Y-8Q — Formulärfeedback, statusmeddelanden och fokusåterställning

Start: `85a0234` (efter 8P). `origin/main` har flyttats en commit, till
`6b70da9` (ACCOUNT-DELETION-F29J1, bara `supabase/account_deletion_staging`).
Det är noterat men inte mergat. Historiska rapporter (8M, 8P) är inte ändrade.

| Fynd | Status efter 8Q |
|---|---|
| B6 Redo: tomt "Lägg till sak" (3.3.1, 4.1.3) | **FIXED** |
| B7 Väder: status och fel annonseras inte (4.1.3) | **FIXED** |
| 8P: fokus faller till `<body>` efter "Dölj" i Mat (2.4.3) | **FIXED** |

## B6 — Redo, "Lägg till sak"

**Före.** `ReadySection.handleAddItem` gör `return` när texten är tom eller
bara blanksteg. Inget visas, inget annonseras, och fältet har `invalid=false`.
Fokus stannar kvar.

**Efter** (`ReadyChecklistCard.jsx`):

- Ett tomt eller blankt värde sparas inte, och meddelandet "Skriv vad du vill
  lägga till innan du sparar." visas under fältet.
- Meddelandet ligger i en statusregion (`role="status"`, polite) som alltid
  finns i DOM:en. Därför annonseras texten när den kommer.
- Fältet får `aria-invalid="true"` och `aria-describedby`, som pekar på
  meddelandet.
- Fokus stannar där användaren skickade formuläret (fältet eller "Spara").
  Fokus flyttas inte, så meddelandet läses inte upp två gånger.
- När texten ändras försvinner meddelandet, `aria-invalid` och beskrivningen.
  Regionen töms, och en tom region annonserar inget.
- En giltig text läggs till som tidigare. Logiken i `handleAddItem` är
  oförändrad.
- Polite status valdes framför `role="alert"`: användaren har just gjort en
  handling och får svaret i samma ögonblick. Ett alert-meddelande hade avbrutit
  i onödan.
- Nya i18n-nycklar: `ready:checklist.emptyError` (sv och en).
- **Begränsning:** trycker man på "Spara" igen med samma tomma fält ändras inte
  texten, så den annonseras inte en gång till. Fältet är fortfarande markerat
  som ogiltigt och har beskrivningen.

## B7 — Hem, "Koppla väder"

**Före** (`OverviewDashboard.jsx`, `OverviewLiveMeta`):
- Status och fel fanns inte i någon live-region.
- `.overview-weather-empty` hade `aria-label="Väder ej anslutet"`. Det skrev
  över den synliga texten, så "Hämtar väder…" nådde aldrig hjälpmedel.
- Att hämtningen lyckades syntes bara visuellt.
- Vid fel visades samma text som i startläget ("Väder ej anslutet").

**Efter:**
- `aria-label` på statustexten är borttagen, så den synliga texten gäller.
- En enda statusregion (`role="status"`, polite, `sr-only`) finns alltid i
  `OverviewLiveMeta`. Den fylls bara när användaren väljer "Koppla väder":
  "Hämtar väder…", sedan "Vädret är uppdaterat." eller "Vädret kunde inte
  hämtas. Försök igen."
- Den automatiska hämtningen när sidan öppnas annonserar inget, så det blir
  inget brus vid sidladdning.
- Felet visas nu också synligt med samma text.
- Fokus flyttas inte.
- Nya i18n-nycklar: `home:weatherUpdated` och `home:weatherFetchFailed`.

### Testbarhet (8M C-N3)

| | |
|---|---|
| Verklig produktionslogik | `connectWeather` → `loadOverviewWeather({ preferDevice: true })` → `requestDeviceLocation` → `fetchOpenMeteoWeather`. Ingen ändring gjordes för testets skull. |
| Teststubbar | `api.open-meteo.com` besvaras av `page.route`: abort för fel, fördröjt svar för laddning, JSON för att lyckas. Geolokalisering beviljas med en fast position (`permissions` och `geolocation` i Playwright). |
| Går inte att verifiera automatiskt | Vad en viss skärmläsare faktiskt säger. Testet kontrollerar semantiken: exakt en live-region, roll och `live=polite` i Chromes tillgänglighetsträd, och att regionen finns innan texten kommer. Även nekad geolokalisering i en riktig webbläsarprompt kan inte testas automatiskt. Utan beviljad behörighet väntar enhetsvägen på sin timeout på 8 s och faller sedan tillbaka på staden. |

## Mat — fokus efter "Dölj" (8P)

**Före.** Knappen "Dölj" tar bort sitt eget kort. Den fokuserade knappen
försvinner, och `document.activeElement` blir `<body>`.

**Efter** (`NutritionActionPlan.jsx`, `RecommendationCard.jsx`):

1. Fokus går till "Dölj" på kortet som tar det borttagna kortets plats, alltså
   nästa kort.
2. Om det inte finns något nästa kort går fokus till föregående korts "Dölj",
   eller till kortets första knapp om det saknar "Dölj".
3. Om inga kort finns kvar går fokus till rubriken "Rekommendationer". Den har
   `tabIndex={-1}`, så den blir inget Tab-stopp, och får en synlig fokusram
   vid `:focus-visible`.
4. Fokus flyttas bara om den borttagna knappen hade fokus.

Beteende vid mus och touch (verifierat):
- **Chromium:** ett klick fokuserar knappen, så fokus flyttas till nästa
  "Dölj". `:focus-visible` gäller inte, så ingen fokusring visas och inget
  syns som ett hopp.
- **Webbläsare som inte fokuserar knappar vid klick (Safari):** fokus flyttas
  inte.

## Tillgänglighetsträd och live-regioner

| Element | Före | Efter |
|---|---|---|
| Redo-fältet efter tom inskickning | textbox, `invalid=false`, ingen beskrivning | textbox, `invalid=true`, beskrivning = felmeddelandet |
| Redo-meddelande | finns inte | `status`, `live=polite`, i DOM:en från början |
| Väderstatus (text) | generic med namnet "Väder ej anslutet", oavsett vad som visades | synlig text, ingen `aria-label` |
| Väderregion | finns inte | `status`, `live=polite`, exakt en med respektive text |
| Fokus efter "Dölj" | `BODY` | nästa korts "Dölj", annars föregående, annars rubriken |

## Tester

`tests/a11y/feedback-status-focus.spec.js` innehåller 3 Chromium-tester:

- **B6:**
  - tomt värde med Tab + Enter, blanksteg med "Spara", och korrigering;
  - kontrollerar synlighet, `aria-invalid`, beskrivning, exakt en live-region,
    fokus, att posten skapas och att inget gammalt meddelande ligger kvar.
- **B7:**
  - start, fel, laddning och lyckat läge;
  - kontrollerar exakt en polite statusregion per meddelande, att "Hämtar
    väder…" inte ligger kvar efter lyckat läge, och att fokus stannar på
    knappen.
- **Mat:**
  - "Dölj" med tangentbordet på första, mittersta och sista kortet, och sedan
    på resten;
  - kontrollerar att fokus hamnar på rätt mål, att målet är synligt (8N-gaten)
    och att det aldrig blir `<body>`.
- **Axe** blockerar på critical, serious och moderate i Redo (normalt och med
  fel), väder (fel, laddning och lyckat läge) och Mat (före och efter "Dölj").
- **I Mat finns ett känt fynd sedan tidigare:** `heading-order` (moderate) på
  `#nutrition-action-plan-title`. Den synliga "Rekommendationer" (h3) följer
  direkt efter h1 "Mat", och det syns även vid en helsidesskanning. Fyndet
  ligger utanför 8Q och är listat exakt i testet.

## Negativa bevis (alla återställda)

- **A:** utan `role="status"` på Redo-meddelandet faller B6-testet.
- **B:** utan `role="status"` på väderregionen faller B7-testet (ingen region).
- **C:** utan `focus()` efter "Dölj" faller Mat-testet, eftersom fokus inte
  hamnar på nästa "Dölj".

## Visuella skillnader

Jämförelsen gjordes i standard, högkontrast och stor text.

| Vy | Skillnad |
|---|---|
| Redo normal | 0 pixlar |
| Redo med fel | +46 px (+56 px med stor text): den nya felraden, avsiktlig |
| Väder: start, laddning och lyckat läge | bara den levande klockan (sekunder) skiljer |
| Väder: fel | ny synlig feltext, och "Koppla väder" bryts till ny rad, avsiktligt |
| Mat före och efter "Dölj" | 0 pixlar |

## Observationer (inte ändrade)

- **Mat, rubriknivå:** `heading-order` (moderate), h1 → h3 i Mat, se ovan.
