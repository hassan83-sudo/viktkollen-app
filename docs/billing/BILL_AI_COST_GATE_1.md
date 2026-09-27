# BILL-AI-COST-GATE-1: kostnadskarta och kostnadsgrind för AI-funktioner

Start: `main` = `038f79f`. Gren: `claude/bill-ai-cost-gate-1`. Ingen migration,
ingen produktionsändring och inga miljövariabler ändrade.

## Antaganden för kostnaderna

**Allt nedan är uppskattningar, inte uppmätt användning eller faktura.**
Produktbeslutet (Gratis eller Premium) tas inte här. Det här är underlaget.

**Valuta:** 1 USD = 10,5 SEK, från repots egen `premiumPricing.exchange.usdToSek`.

### OpenAI
- **Token per anrop:** repots egna planeringsvärden i
  `src/services/premiumPricing.js`, till exempel att AI Coach har 1 500 token
  in och 300 ut.
- **Pris:** två värden ger ett intervall.
  - *Repopris:* 0,15 respektive 0,60 USD per miljon token in/ut, som står i
    `premiumPricing`.
  - *Listpris för `gpt-4.1-mini`,* den modell som routerna använder: 0,40
    respektive 1,60 USD per miljon token (listpris så vitt känt; stäm av mot
    OpenAI).
- **Bild:** 0,003 USD per bild, enligt repots uppskattning.
- **Priser saknas för:** `gpt-5.6-luna` (standardmodell i `api/ai`) och
  Realtime-modellen. De är **UNKNOWN**.

### Cloud Run (`perch-inference`, europe-west1)
- **Listpris, request-baserad debitering:**

  | Resurs | Pris |
  |---|---|
  | CPU | 0,000024 USD per vCPU-sekund |
  | Minne | 0,0000025 USD per GiB-sekund |
  | Anrop | 0,40 USD per miljon |

- **Gratiskvot per faktureringskonto och månad:** 180 000 vCPU-s, 360 000
  GiB-s och 2 miljoner anrop. Stäm av priserna mot Googles prislista. Om
  gratiskvoten redan används av annat i projektet `perch-bird-poc` är okänt.
- **Uppmätt i repot** (`docs/ai-ear`):
  - varm latens < 0,5 s;
  - kallstart cirka 8 s;
  - kallstarter observeras, alltså skalar tjänsten till noll (inga fasta
    instanser);
  - svaret är några kB JSON, så trafikkostnaden är försumbar.
- **Finns inte i repot:** vCPU, minne, `max-instances` och concurrency.
  Därför ges ett intervall:
  - *låg:* 1 vCPU, 2 GiB, 0,5 s;
  - *mitten:* 2 vCPU, 4 GiB, 1 s;
  - *hög:* 2 vCPU, 4 GiB, 8,5 s, det vill säga varje analys är en kallstart.
    Det gäller vid mycket låg trafik. Vid 100 000 eller fler analyser används
    4 vCPU, 8 GiB och 2 s.

### Vercel
Varje analys ger två funktionsanrop: consent-token och själva hoppet.
Kostnaden beror på Vercels plan och är **UNKNOWN**, men av samma
storleksordning eller mindre än Cloud Run. **Obs:** Hobby-planen är enligt
Vercels villkor inte för kommersiellt bruk.

## A. Kostnadskarta

| Funktion | Klient | Serverroute | Leverantör/modell | Körs | Rörlig kostnad | Gratis kan köra i dag | Servergrind | Kvot/hastighet |
|---|---|---|---|---|---|---|---|---|
| **AI Örat: Ljudigenkänning** | `AiEarMode` (läge sound) | `/api/ai-ear/interpret` → Cloud Run `/v2/interpret` | Perch v2 + YAMNet, egen drift | Viktkollens server | **NEGLIGIBLE** (uppskattning) | Ja | Inloggning, consent-token, brytare `AI_EAR_ENABLED` | Processlokal hastighetsgräns, 10 per 10 min och instans. Ingen kvot. `max-instances` okänt. |
| **AI Örat: Fågelljud** | `AiEarMode` (läge bird) | samma anrop | samma | samma | **NEGLIGIBLE** | Ja | samma | samma |
| **AI Örat: Tal → text** | `AiEarMode` (läge speech) | *ingen på main*; bara `sprint-12a` `/api/ai-ear-lyrics-transcription` | OpenAI `gpt-transcribe` | externt API | **MEANINGFUL** | **Nej**, ingen route på main | ingen (vilande) | – |
| **AI Örat: Humma / sjung** | `AiEarMode` (läge melody) | *ingen på main*; bara `sprint-12a` `/api/ai-ear-humming-recognition` | ACRCloud Humming | externt API | **MEANINGFUL**; pris **UNKNOWN** | **Nej** | ingen (vilande) | – |
| Musikigenkänning (vilande) | – | bara `sprint-12a` `/api/ai-ear-music-recognition` | AudD | externt API | **MEANINGFUL**; pris **UNKNOWN** | **Nej** | ingen (vilande) | – |
| **AI Ögat** (Smart kamera) | Smart kamera | `/api/forgotten-items-analysis` | OpenAI `gpt-4.1-mini` vision | externt API | **MEANINGFUL** | Ja, inom kvot | Befintlig live-billing före OpenAI | Free-kvot 25 (planmatrisen) och hastighetsgräns |
| **Matscanning** | Mat | `/api/nutrition-photo-analysis` | OpenAI `gpt-4.1-mini` vision | externt API | **MEANINGFUL** | Ja, inom kvot | live-billing | Free-kvot 5 och hastighetsgräns |
| Matanalys (legacy) | – | `/api/meal-analysis` | – | – | **NONE** (avvisar alltid) | – | stängd | – |
| **Kroppsscanning** | Body Scan | `/api/body-analysis` | OpenAI vision, 3 bilder | externt API | **MEANINGFUL** | Ja, inom kvot | live-billing | Free-kvot 3 och hastighetsgräns |
| **AI Coach, AI-text** | Coach och chatt | `/api/ai` (chat, daily-coach, weekly-report, proactive-coach, study-buddy), `/api/adaptive-coach` | OpenAI (`gpt-5.6-luna` standard i `api/ai`; `gpt-4.1-mini` via gateway) | externt API | **MEANINGFUL** | **Ja, utan kvot** | **Ingen före OpenAI.** Bara inloggning. Användningen registreras *efter* anropet. | Bara processlokal hastighetsgräns (20 respektive 8 per 10 min och instans). Free-kvoten 20 i planmatrisen tillämpas inte i routen. |
| **Realtidsröst** | AI Coach (avstängd i klienten) | `/api/ai` action `realtime-session` | OpenAI `gpt-4o-mini-realtime-preview` | externt API | pris **UNKNOWN** | **Var ja** (servern skapade sessioner åt alla inloggade). **Nu nej.** | **Ny:** kostnadsgrind, BLOCK_UNTIL_VERIFIED | – |
| Taligenkänning (Coach) | `voiceConversationController` | ingen | webbläsarens SpeechRecognition | webbläsaren | **NONE** för Viktkollen | Ja | – | – |
| Talsyntes | `accessibilitySpeech`, AI Coach | ingen | webbläsarens speechSynthesis | webbläsaren | **NONE** | Ja | – | – |
| Analysmedgivande | alla analyser | `/api/analysis-consent` | lokal HMAC | Viktkollens server | **NONE**; bara Vercel-anrop | Ja | inloggning | hastighetsgräns |

### Kostnad vid skala (uppskattning, före gratiskvoter)

| Funktion | Per analys (USD) | 10 000 per månad | 100 000 per månad | 1 000 000 per månad | Klassning vid lansering (underlag) |
|---|---|---|---|---|---|
| AI Örat, ljud och fågel (Cloud Run) | 0,000015 / 0,00006 / 0,0005 (hög, bara kallstarter) | 0,15–5 USD ≈ **2–53 SEK** (mitten ≈ 6 SEK; sannolikt 0 inom gratiskvoten) | 1,5–23 USD ≈ **16–244 SEK** (mitten ≈ 61 SEK) | 15–232 USD ≈ **156–2 440 SEK** (mitten ≈ 613 SEK) | **FREE / NEGLIGIBLE COST** som kandidat |
| AI-text, AI Coach | 0,0004 (repopris) – 0,0011 (listpris 4.1-mini); `gpt-5.6-luna` UNKNOWN | 4–11 USD ≈ 43–113 SEK | 41–108 USD ≈ 425–1 134 SEK | 405–1 080 USD ≈ 4 250–11 340 SEK | **PREMIUM / METERED** (Free-kvot enligt matrisen) |
| Matscanning | 0,0033–0,0039 | 33–39 USD ≈ 351–412 SEK | 335–392 USD ≈ 3 500–4 100 SEK | 3 345–3 920 USD ≈ 35 000–41 000 SEK | **PREMIUM / METERED** (Free-kvot 5) |
| AI Ögat | cirka 0,0035–0,004 (antaget som matscanning; lågt säkerhetsläge) | ≈ 370–420 SEK | ≈ 3 700–4 200 SEK | ≈ 37 000–42 000 SEK | **PREMIUM / METERED** (Free-kvot 25) |
| Kroppsscanning (3 bilder) | 0,0095–0,0103 | 95–103 USD ≈ 995–1 080 SEK | 948–1 028 USD ≈ 9 950–10 800 SEK | 9 480–10 280 USD ≈ 99 500–108 000 SEK | **PREMIUM / METERED** (Free-kvot 3) |
| Tal → text (vilande) | 0,0012 per klipp på 12 s (0,006 USD per minut, per sekund); 0,006 om varje anrop avrundas till en minut | 12–60 USD ≈ 126–630 SEK | 120–600 USD ≈ 1 260–6 300 SEK | 1 200–6 000 USD ≈ 12 600–63 000 SEK | **PREMIUM / METERED** |
| Humma / sjung (vilande) | UNKNOWN (ACRCloud-pris saknas i repot) | UNKNOWN | UNKNOWN | UNKNOWN | **PREMIUM / METERED** |
| Musikigenkänning (vilande) | UNKNOWN (AudD) | UNKNOWN | UNKNOWN | UNKNOWN | ej prioriterad; **PREMIUM / METERED** om den återställs |
| Realtidsröst | UNKNOWN per minut. Sessionen är upp till 180 s, med 45 s inaktivitet. | UNKNOWN | UNKNOWN | UNKNOWN | **BLOCK UNTIL VERIFIED** |

### Användare är inte samma sak som analyser

Exemplen visar räknesättet. De är inte uppmätt användning.

| Scenario | Analyser per månad | Cloud Run (mitten) | Matscanning |
|---|---|---|---|
| 100 000 användare × 10 % använder funktionen × 1 analys | 10 000 | ≈ 6 SEK, sannolikt 0 inom gratiskvoten | ≈ 350–410 SEK |
| 100 000 användare × 50 % × 2 analyser | 100 000 | ≈ 61 SEK | ≈ 3 500–4 100 SEK |
| 100 000 användare × 100 % × 10 analyser | 1 000 000 | ≈ 613 SEK (högt: ≈ 2 440) | ≈ 35 000–41 000 SEK |

## B. AI Örat

- **Ljudigenkänning:**
  - körs i Viktkollens egen Cloud Run (Perch + YAMNet), utan någon
    tredjepartsavgift;
  - kostnadsklass NEGLIGIBLE: 10 000 analyser ger 2–53 SEK (mitten ≈ 6),
    100 000 ger 16–244 SEK (≈ 61) och 1 000 000 ger 156–2 440 SEK (≈ 613);
  - **underlag:** GRATIS kan vara kvar. För att kunna bekräfta krävs två
    saker:
    1. `gcloud run services describe perch-inference` för vCPU, minne,
       concurrency och `max-instances`;
    2. ett `max-instances`-tak som kostnadsspärr.
- **Fågelljud:** samma anrop och samma kostnad. Samma underlag.
- **Tal → text:** den enda implementationen är OpenAI `gpt-transcribe` på den
  ej mergade `sprint-12a`. MEANINGFUL. **Går inte att nå:** det finns ingen
  route på main, och klienten skickar inget (`execution: null`).
- **Humma / sjung:** ACRCloud, bara på `sprint-12a`. MEANINGFUL, pris UNKNOWN.
  **Går inte att nå.**

**Kan gratisanvändare i dag utlösa en MEANINGFUL rörlig kostnad via AI Örat?
NO.** Den enda kostnaden är den försumbara Cloud Run-beräkningen för ljud och
fågel. Den begränsas bara av en processlokal hastighetsgräns och av
`AI_EAR_ENABLED`, eftersom `max-instances` är okänt.

## C. Hela appen

**Kan gratisanvändare i dag skapa MEANINGFUL eller obegränsad rörlig
AI-kostnad? YES,** via AI-text:

| Route | Actions | Vad som skyddar i dag |
|---|---|---|
| `POST /api/ai` | chat, daily-coach, weekly-report, proactive-coach, study-buddy | Bara inloggning och en processlokal gräns på 20 per 10 min och instans |
| `POST /api/adaptive-coach` | – | Bara inloggning och en processlokal gräns på 8 per 10 min och instans |

- **Varför det är obegränsat:** Free-kvoten `ai_text_requests` 20 finns i
  planmatrisen men tillämpas inte före OpenAI-anropet. Den processlokala
  gränsen nollställs per serverlös instans, så det finns ingen global månadsgräns.
- **Stängt i den här sprinten:** `POST /api/ai` action `realtime-session`,
  som skapade OpenAI Realtime-sessioner åt alla inloggade trots att klienten
  har funktionen avstängd.
- **Begränsat av befintlig billing** (Free-kvot före OpenAI): matscanning,
  AI Ögat och kroppsscanning. De är MEANINGFUL men har ett tak.

**Premium är inte obegränsat.** De betalda planerna har kvoter i
planmatrisen. För AI-text tillämpas de inte heller än. Ljud och fågel behöver
ingen billing-kvot. En global hastighetsgräns eller ett `max-instances`-tak
räcker mot missbruk, och den processlokala gränsen är för svag som spärr.

## Grinden (implementerad)

- `src/services/billing/featureCostPolicy.js`:
  - kostnadsklass per funktion: `FREE_NEGLIGIBLE`, `METERED` eller
    `BLOCK_UNTIL_VERIFIED`;
  - flaggan `premiumOnly`;
  - en funktion som saknas i listan blockeras.
- `api/_shared/billing/featureCostGate.js`:
  - `evaluateFeatureCostGate` i ordningen AUTH → kostnadsklass → PLAN från
    serverlästa abonnemang → Premium-krav → befintliga
    `evaluateBillingOperation` (entitlement, kostnadsspärr, kvot) → ALLOW;
  - `runCostGatedOperation` kör leverantören **bara** efter ALLOW.
  - Klientens påståenden (plan, premium, kvar-kvot, admin, användar-id) läses
    aldrig som auktoritet.
  - Grinden reserverar inte kvot. Det gör den befintliga durable-livscykeln i
    live-routerna.
- **Kopplad** till `api/ai` action `realtime-session` (BLOCK_UNTIL_VERIFIED).
  Svaret är detsamma "inte tillgängligt" som klienten redan hanterar.
- **Inte kopplad:** AI-text. Att tillämpa Free-kvoten ändrar produktbeteendet
  och kräver samma durable reservation som mat, kropp och AI Ögat. Det är
  nästa sprint.

## Tester

- **`api/_shared/billing/featureCostGate.test.js`** (12 tester):
  - Free + Premium-funktion nekas före billing;
  - utan entitlement (utgånget abonnemang, okänd plan) nekas;
  - förfalskad Premium (plan, premium, admin, annat användar-id) nekas;
  - förfalskad kvot ignoreras;
  - nekad förfrågan ger 0 anrop till leverantören;
  - Premium når kvotlagret med serverns användar-id;
  - slut på kvot stoppar kostnaden;
  - utan verifierad användare körs inget;
  - Free-kvot enligt matrisen når kvotlagret;
  - vilande AI Örat-leverantörer nekas även för Premium;
  - Realtime och okända funktioner blockeras;
  - AI Örats analys fungerar gratis utan plan och kvot;
  - varje EXTERNAL_COST-funktion har en klass;
  - ingen migration skapar `public.user_entitlements`.
- **`api/ai/index.test.js`:** testet som förväntade att en Realtime-session
  skapas är ersatt. Det nya testet visar att ingen session skapas och att
  fetch inte anropas, även med API-nyckel och förfalskad Premium.

## Nästa sprint (föreslagen, inte startad)

**BILL-AI-TEXT-QUOTA-1:** koppla `ai.text.request` i `/api/ai` (alla
OpenAI-actions) och `/api/adaptive-coach` till samma durable metered-livscykel
som `aiEyeLiveBilling`. Det innebär reserve före OpenAI, commit eller rollback
efteråt, och kvoten ur planmatrisen, som redan gäller för Free och de betalda
planerna. Nekad förfrågan ska ge 0 OpenAI-anrop.

**Därefter**, i ordning:
1. ett `max-instances`-tak och en global hastighetsgräns för `perch-inference`;
2. Cloud Run-konfigurationen verifierad (vCPU, minne);
3. prissättning av Realtime innan den klassas om.
