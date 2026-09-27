# AI-EAR-1: AI Örats fyra lägen

Grenen `claude/ai-ear-1` skapades från `main` (`ebe7a0a`). Det fanns ingen
tidigare AI-EAR-1-sprint eller audit att fortsätta från. Därför gjordes först
en kort kodinventering av de faktiska exekveringsvägarna, som kostnadsbesluten
nedan bygger på.

## Vad som är byggt

AI Örat (`src/features/ai-ear/AiEarMode.jsx`) har nu fyra separata lägen i
samma vy. Inga nya flikar i bottennavigeringen och ingen ändring i Smart
kameras värdkomponent.

| Läge | Kort | Instruktion | Flöde |
|---|---|---|---|
| 🔊 Ljudigenkänning | "Känn igen ljud omkring dig" · **Gratis** | "Spela in ett ljud omkring dig." | Spela in eller Välj ljudfil → Analysera. Resultatet visas som **"AI hör"** med rubriken och de ljudklasser modellen returnerade (till exempel "Hund", "Tal"). |
| 🐦 Fågelljud | "Försök identifiera fågellätet" · **Gratis** | "Spela in fågeln så tydligt som möjligt." | Samma flöde. **"Mest sannolikt"** visar den ledande arten, och **"Alternativ"** visar de övriga arter backend skickade. En osäker kandidat behåller backendens förbehåll ("Möjlig kandidat, osäker: …"). Tal, musik och vissling visas som "Ingen fågel hördes tydligt". |
| 🗣️ Tal → text | "Gör tal till skriven text" · **Premium** | "Spela in tal eller välj en ljudfil." | **Inte kopplat.** Texten säger att läget kräver Premium och inte är tillgängligt än. Det finns ingen inspelning, ingen filväljare och inget anrop. |
| 🎶 Humma / sjung | "Analysera hummad eller sjungen melodi" · **Premium** | "Humma eller sjung melodin." | **Inte kopplat,** på samma sätt som Tal → text. |

- **Samma analys för ljud och fågel.** Båda använder samma anrop,
  `/api/ai-ear/interpret`. Lägena skiljer sig bara i hur resultatet visas.
  Ingen egen klassificerare per ljud är byggd: ljudklasserna är de som backend
  (YAMNet via routern) redan returnerar.
- **Ingen säkerhetsnivå visas.** Server-hoppen tar bort alla poäng innan
  resultatet når klienten (`api/ai-ear/interpret`, `reduceBackendResult`).
  Därför finns ingen sannolikhet att visa, och ingen hittas på.
- **Inget för vanlig musikigenkänning (Shazam-liknande) är byggt.** Den gamla
  AudD-koden på `ai-ear-sprint4` och `sprint-12a` är orörd.
- **Tal och melodi hålls isär.** Transkribering (vad som sägs) och
  melodiigenkänning (vilken låt som hummas eller sjungs) är två olika lägen med
  olika texter. Om någon *säger* en låttitel i Tal → text blir det bara en
  transkription, aldrig ett "identifierat" låtnamn. Premium-lägena är inte
  kopplade än, så det finns inget beteende att pröva i dag.

## Exekveringsväg och kostnad per läge

| Läge | Execution | Provider/model | Kostnad per användning hos leverantör | Rekommenderad åtkomst vid lansering |
|---|---|---|---|---|
| **LJUDIGENKÄNNING** | Viktkollens server: Vercel-funktionen `/api/ai-ear/interpret` → Viktkollens egna **privata Cloud Run**-tjänst `perch-inference` (Google Cloud, `/v2/interpret`) | Google **Perch v2 + YAMNet** (öppna modeller, egen drift), router 10v.0 | **Ingen avgift till tredjepartsleverantör.** Varje analys kostar dock en liten **variabel Cloud Run-beräkning** i Viktkollens eget GCP-projekt. Billing klassar `ai.ear.interpret` som `EXTERNAL_COST`, mätt per anrop. Beloppet per analys framgår inte av koden och är **UNKNOWN**. | **FREE.** Det följer Cursors beslut i `LAUNCH_UNMETERED_FEATURES` (`ai.ear.interpret` är gratis och omätt vid lansering). Servern har redan en hastighetsgräns (`checkAiRouteRateLimit`) och en brytare (`AI_EAR_ENABLED`). |
| **FÅGELLJUD** | Samma som ovan, i **samma anrop** | Google **Perch v2** (arter) + YAMNet (miljö) | Samma som ovan | **FREE**, som ovan |
| **TAL → TEXT** | Finns **inte** på `main` eller på den här grenen. Den enda implementationen ligger på den ej mergade grenen `sprint-12a-ai-ear-reintegration`: Vercel `/api/ai-ear-lyrics-transcription` → **externt API** | **OpenAI** speech-to-text (`gpt-transcribe`, `/v1/audio/transcriptions`) | **YES.** Debiteras per minut (`premiumPricing.externalTranscription`). | **PREMIUM** |
| **HUMMA / SJUNG** | Finns **inte** på `main` eller på den här grenen. Bara på `sprint-12a`: Vercel `/api/ai-ear-humming-recognition` → **externt API** | **ACRCloud** Humming Identification (`/v1/identify`) | **YES.** Debiteras per förfrågan enligt ACRCloud-avtal. Credentials saknas i Vercel enligt 12A-rapporten. | **PREMIUM** |

**Upptäckt, inte ändrat:** den befintliga koden har redan en
speech-to-text-väg utan kostnad per användning för Viktkollen:
webbläsarens egen taligenkänning, som används i `voiceConversationController`.
- Den fungerar bara för live-mikrofon, inte för ljudfiler.
- Den finns inte i alla webbläsare.
- Webbläsaren skickar ljudet till sin egen leverantör, vilket kräver en egen
  sekretessformulering.

Det skulle göra Tal → text *delvis* gratis. Det är ett produktbeslut och är
inte byggt.

## Kan 10 000 gratisanvändare utlösa en betald AI/API-förfrågan via AI Örat?

**NO.** Det gäller `main` och den här grenen, för betalda tredjeparts-API:er.
- OpenAI-transkribering, ACRCloud och AudD går inte att nå från AI Örat. Det
  finns ingen route på `main`, och klienten har ingen kod som anropar dem.
  Ett test låser det.
- Tal → text och Humma / sjung har `execution: null` och kan inte skicka ljud.

**Förbehåll:**
1. **Cloud Run:** ljud- och fågelanalysen kostar lite Cloud Run-beräkning per
   anrop i Viktkollens eget projekt, utan leverantörsavgift. Gratisanvändare
   kan utlösa den, som Cursors lanseringsmatris avser. Den begränsas i dag av
   serverns hastighetsgräns och brytaren `AI_EAR_ENABLED`, men **inte** av en
   kvot per användare.
2. **NOT YET ENFORCED** om `sprint-12a-ai-ear-reintegration` mergas. Då blir
   följande vägar nåbara för alla inloggade, och Cursor måste gata dem på
   servern innan de mergas eller aktiveras:
   - `api/ai-ear-lyrics-transcription` (OpenAI);
   - `api/ai-ear-humming-recognition` (ACRCloud);
   - `api/ai-ear-music-recognition` (AudD);
   - alla tre levereras via `api/ai-ear-providers` och vercel-rewrites.

## Integrationspunkt för Premium (Cursor)

`src/features/ai-ear/aiEarModes.js`:
- varje läge har `access` (`free` eller `premium`) och `execution`;
- Premium-lägen har `execution: null`.

Ordning för att koppla dem:
1. Servern kontrollerar entitlement och kvot i routen, före
   leverantörsanropet. Det görs i Cursors billing-lager och är inte byggt här.
2. Först därefter får läget en `execution`, och klienten får en renderare för
   leverantörens resultat (transkription eller melodi).

Knappen och märkningen "Premium" i klienten är bara information, **inte en
säkerhetsgräns**. Ingen klientsidig "gate" är byggd och kallad säker.

## Tillgänglighet

- **Lägesvalet** är en riktig radiogrupp: `fieldset` med `legend` "Vad vill du
  använda?". Varje kort är radioknappens `label`, så hela kortet är träffytan.
  Namnet är titeln, beskrivningen och "Gratis" eller "Premium" som text.
  Ikonen är `aria-hidden`. Pilarna byter läge med wrap, som i en native
  radiogrupp.
- **Rubriker:** `h3` AI Örat → `h4` valt läge → `h5` resultat eller fel.
- **Status:**
  - "Analysera …" har `aria-busy`;
  - resultatet är `role="status"`;
  - fel är `role="alert"` med knapparna Försök igen och Ny inspelning;
  - mikrofonen meddelas en gång.
  - Allt detta är oförändrat från A11Y-8D.
- **Låst läge:** lägesvalet är `disabled` under inspelning, förberedelse och
  analys, så att en pågående inspelning inte kan tappas.
- **Utseende:**
  - valt kort har tjockare kant och en markerad radioknapp, inte bara färg;
  - fokusringen syns på kortet (`:has(input:focus-visible)`);
  - korten är minst 44 px höga;
  - rutnätet går till en kolumn på smala skärmar;
  - spinnern respekterar reducerad rörelse (befintligt).
- **Chromium (tillfällig probe, inte committad),** vid 390 px och vid 320 px
  med extra stor text och stora kontroller:
  - pil ner går genom alla 4 lägen och tillbaka, och rubriken följer;
  - fokus syns utan problem;
  - korten är 370×75 respektive 300×82–97 px;
  - ingen sidledsscroll (0 px);
  - axe 0 fynd i lägena ljud och tal.

## Tester

- **`src/features/ai-ear/aiEarModes.test.jsx`** (ny, 9 tester):
  - radiogruppen och korten med namn och Gratis eller Premium;
  - rubrik och instruktion per läge;
  - Premium-lägena kan inte spela in, välja fil eller skicka;
  - fågelläge: "Mest sannolikt" och "Alternativ", ingen sannolikhet, förbehåll
    för osäker art, "Ingen fågel …" vid tal;
  - ljudläge: "AI hör" med ljudklasserna;
  - lägesvalet är låst under analys;
  - engelska;
  - åtkomsten följer den verifierade vägen, `ai.ear.interpret` är omätt i
    billing, och ingen betald provider-URL finns i AI Örats kod.
- **`AiEarMode.test.jsx`:** 2 tester är anpassade.
  - Resultatrubriken är nu `h5`.
  - `/tal/i` matchade även kortet "Tal → text" och kontrollerar nu exakt
    tal-rubriken.
- **Kontroller:**

  | Kontroll | Resultat |
  |---|---|
  | AI Örat, Smart kamera och API | 149 av 149 |
  | `test:a11y` | 524 av 524 (AI Örat ingår) |
  | `i18n:check` | OK |
  | `i18n:hardcoded` | 0 |
  | build | OK |
  | `git diff --check` | OK |
  | lint | 51 (baslinjen) |

- **Inte körda:** hela Playwright-sviten för tillgänglighet och hela Vitest.

## Inte ändrat

- Smart kamera: `SmartCameraModeViews` och `SmartCameraStage`.
- `api/ai-ear/interpret` och Cloud Run.
- Billing, kvoter och entitlements.
- Supabase, Body Scan, Molnbackup och Inställningar.
- Grenarna `ai-ear-sprint*` och `sprint-12a`.
