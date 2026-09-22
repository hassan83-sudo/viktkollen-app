# A11Y-5G: Samlad tillgänglighets-, UX- och integritetsgranskning

## Granskad grund

Granskningen omfattar A11Y-5A till A11Y-5F:

- `52b697f` – återställd hubb och kommunikation
- `85e5d91` – opt-in navigationsuppläsning
- `53fbfe1` – synliga alternativ till ljudsignaler
- `ed27b5b` – lokal kommunikation
- `2dbea3d` – motorisk åtkomst
- `a891746` – kognitivt och lässtöd

Endast Tillgänglighet & hjälpmedel, dess direkta hjälpare och deras tester har granskats. Ingen ny funktionskategori, rutt, extern tjänst eller profil har införts.

## Inställningar och tillstånd

| Inställning | Syfte och standard | Ägare/persistens | Berörd yta |
|---|---|---|---|
| `navigationSpeech` | Tangentbordsfokus läses upp; av | `AccessibilityHub`, namespaced `localStorage` | Hubben och detaljvyer |
| `navigationSpeechRate` | Långsam, normal eller snabb; normal | Samma lokala inställning | Navigationsuppläsning |
| `textSize` | Normal, stor eller extra stor; normal | Samma lokala inställning | Tillgänglighetsvyn |
| `highContrast`, `reduceMotion`, `lineSpacing`, `simpleReading` | Lokal visningsanpassning; av | Samma lokala inställning | Tillgänglighetsvyn |
| `largeControls`, `avoidPreciseGestures`, `extraInteractionTime`, `keyboardFriendly` | Lokal motorikförhandsvisning; av | Samma lokala inställning | Tillgänglighetsvyn |
| `visualFeedback`, `hapticFeedback`, `calmMode`, `seniorMode` | Lokal återkoppling/förhandsvisning; av | Samma lokala inställning | Tillgänglighetsvyn |

Alla inställningar normaliseras mot en fast tillåten uppsättning innan de sparas under `viktkollen.accessibility.preferences.v1`. De innehåller inga diagnoser, fria texter eller andra känsliga värden.

| Tillståndsklass | Exempel | Lagring |
|---|---|---|
| Tillfälligt React/UI | Aktiv sektion, fokusretur, vald fras, kommunikationstext, ångra rensning, stor text, talstatus | Endast komponentminne |
| Lokal inställning | Tabellen ovan | Namngiven `localStorage`-nyckel |
| Serverbeständigt | Inget i A11Y-ytan | Finns inte |

Kommunikationstext och stor text kommer från `customText` i `AccessibilityCommunication`. De skickas inte till `localStorage`, `sessionStorage`, IndexedDB, nätverk, analys eller server.

## Integritets- och säkerhetskontroll

Genomsökning av körbar A11Y-kod och direkta hjälpare fann inga `fetch`-, Supabase-, analys-, `console`-, externa resurs-, `sessionStorage`- eller IndexedDB-anrop. Browserns `speechSynthesis` är den enda TTS-mekanismen. Inga mikrofon-, kamera-, inspelnings- eller taligenkänningsvägar används.

Ingen produktionskod i detta område använder `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, osäkra URL:er eller användarstyrd navigering. Kommunikationstext renderas som React-text, aldrig som markup. Den enda `innerHTML`-användningen som hittades ligger i testuppbyggnad för den säkra etikettutvinningen.

## TTS och status

`accessibilitySpeech.js` är den enda delade browser-TTS-grunden. Varje ny uppläsning avbryter den tidigare webbläsarkön. Navigationsuppläsning använder redan begärande-id för föråldrade callbacks. Den samlade granskningen hittade att manuell kommunikation saknade motsvarande skydd: en sen callback från en avbruten uppläsning kunde skriva över aktuell synlig status.

Det är åtgärdat lokalt med ett begärande-id i `AccessibilityCommunication`. Snabb Läs upp, Stoppa, byte av fras, återgång och avmontering gör tidigare callbacks inaktuella. Navigationsuppläsning, manuell textuppläsning och Läs upp hjälp delar därför samma kö utan överlappande status. Status använder synlig `AccessibilityFeedback` med `role="status"`, `aria-live="polite"` och deduplicering av identiskt meddelande/tillstånd.

## Skärmläsare, tangentbord och interaktion

Primära åtgärder är namngivna vanliga knappar eller ett textarea-fält. Hubben återställer fokus till öppningskortet efter Tillbaka. Stor text fokuserar Stäng stor text, Escape stänger vyn och fokus går tillbaka till Visa stort. Den frivilliga hjälpen är ett native `details`/`summary`-block med synlig fokusring och öppnas/läses aldrig automatiskt.

Ingen tangentbordsfälla, `tabindex` över noll, krav på svepning, dragning, långtryck, dubbeltryck eller flerfingersinteraktion finns i den granskade ytan. Snabbfraser läser aldrig upp automatiskt. Viktiga ljud-/talstatusar har synlig text även när TTS är av eller saknas.

## Visning och enkel text

Granskningen täcker reducerad rörelse, hög kontrast, stor/extra stor text, 44 px primära kontroller, 52 px snabbfraser och enkolumnsregler vid 390/430 px. Ingen animation är nödvändig för att förstå status. Den befintliga lokala `Enklare texter`-förhandsvisningen behålls; en parallell textvariant är fortfarande inte motiverad eftersom den skulle duplicera översättningar utan verifierad nytta.

Automatiserade CSS- och komponenttester kan inte ersätta manuell visuell kontroll i riktig mobil webbläsare eller 200 % zoom.

## Kombinerad matris A–R

| ID | Scenario | Resultat | Evidens |
|---|---|---|---|
| A | Standardläge och säkra standardvärden | PASS | Preferenstester |
| B | Opt-in navigationsuppläsning och takt | PASS | Hubbtjänst- och komponenttester |
| C | Kommunikation och snabbfraser | PASS | Kommunikationstester |
| D | Manuell Läs upp text | PASS | Delad browser-TTS-test |
| E | Manuell Läs upp hjälp och Stoppa | PASS | Kommunikationstest |
| F | Hörsel-/talstatus utan ljud | PASS | Synlig `AccessibilityFeedback` |
| G | Reducerad rörelse | PASS | Scope-CSS och hubbtest |
| H | Hög kontrast | PASS | Scope-CSS och hubbtest |
| I | Stor/extra stor text | PASS | Scope-CSS och hubbtest |
| J | Tab, Shift+Tab, Enter, Space och Escape | PASS | Native kontroller samt fokus-/Escape-test |
| K | Skärmläsare och live-regioner | PASS | Namn, semantik och deduplicerad polite-status |
| L | 390 px | PASS | Responsiva CSS-regressioner |
| M | 430 px | PASS | Responsiva CSS-regressioner |
| N | Kombinerat navigations-TTS och kommunikation | PASS | Ny kö-/arbitreringstest |
| O | TTS saknas eller ger fel | PASS | Synligt återställningsmeddelande |
| P | Snabb Läs upp och Stoppa | PASS | Ny test för inaktuella callbacks |
| Q | Stor text, fokus och återgång | PASS | Kommunikationstest |
| R | Rendering, nätverk, lagring och loggning | PASS | Kodsökning och beständighetsgranskning |

## Kvarvarande luckor och nästa steg

Ingen verifierad säkerhets- eller integritetssårbarhet hittades i den avgränsade A11Y-koden. Återstående begränsning är manuell testning med riktiga skärmläsare, mobil enhet och 200 % zoom. Rekommenderat nästa steg är en separat human-ledd slutanvändargranskning av den redan levererade A11Y-ytan; starta inte någon ny funktionell sprint utan godkännande.
