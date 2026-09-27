# AI-EAR-2C: Tal → text i webbläsaren

Grenen `claude/ai-ear-2b` bygger vidare på AI-EAR-2B (`318b027`, den
gemensamma MediaRecorder-kroken). Grenen är inte mergad till `main`.

## Vad som är byggt

Läget **🗣️ Tal → text** i AI Örat är nu aktivt. Webbläsarens egen
taligenkänning gör om talet till text, via `SpeechRecognition` eller
`webkitSpeechRecognition`.

| Del | Fil |
|---|---|
| Kontroller (start, stop, abort, dispose, felkoder) | `src/services/aiEarDictation.js` |
| Panel (knappar, status, transkription) | `src/features/ai-ear/AiEarDictation.jsx` |
| Lägeskoppling (`execution: 'browser'`) | `src/features/ai-ear/aiEarModes.js`, `AiEarMode.jsx` |
| Texter (sv, en) | `src/i18n/resources.js` → `aiEar.dictation` |
| Tester | `src/services/aiEarDictation.test.js`, `src/features/ai-ear/AiEarDictation.test.jsx` |

- **Motor.** Konstruktorn väljs med `getSpeechRecognitionConstructor` och
  språket med `getSpeechLocale` från `voiceConversationController.js`
  (sv → sv-SE, en → en-US, da → da-DK, allt annat → sv-SE). Kontrollern är
  separat från AI Coach, så AI Coach påverkas inte.
- **Ingen server och ingen leverantör.** Det finns ingen ny API-route,
  ingen OpenAI, ingen ACRCloud och ingen AudD, och ingen ljudfil skapas.
  Viktkollen tar inte emot ljudet och sparar inte texten: den finns bara i
  komponentens minne tills användaren rensar den eller lämnar läget.
- **En mikrofon åt gången.** Tal → text använder aldrig `getUserMedia` eller
  `MediaRecorder`. Medan en inspelning pågår i Ljud eller Fågel är
  lägesväljaren låst, och panelen vägrar starta om `microphoneBusy` är sant.
  Vid lägesbyte avbryts både inspelaren (`recorder.cancel()`) och
  taligenkänningen, eftersom panelen avmonteras och kontrollern kör `dispose()`.
- **Uppstädning.** Vid avmontering (lägesbyte eller när användaren lämnar AI
  Örat) körs `abort()`. Händelsehanterarna kopplas bort först, så ingen
  callback körs efteråt.

## Tillgänglighet

- En enda knapp växlar mellan **Starta lyssning** och **Stoppa lyssning**.
  Fokus ligger därför kvar på knappen när den ändras.
- Det finns en enda `role="status"`. Den läser upp "Lyssnar…" en gång, sedan
  "Klart. Texten finns under Transkription." (bara om sessionen gav text),
  "Kopierat" eller "Texten är rensad.".
- Mellanresultat visas men ligger utanför live-regionen, så skärmläsaren
  avbryts inte medan användaren pratar. Fokus flyttas aldrig när text kommer
  in.
- Fel visas som `role="alert"` med en rubrik, en förklaring och knappen
  **Försök igen**. Texten är alltid lokaliserad och aldrig webbläsarens råa
  felmeddelande.
- **Rensa** tömmer texten och flyttar fokus tillbaka till startknappen,
  eftersom Rensa-knappen själv försvinner.

## Fel

| Webbläsarens fel | Kod | Rubrik (sv) |
|---|---|---|
| `not-allowed`, `service-not-allowed` | `mic_denied` | Mikrofonen är inte tillåten |
| `no-speech` | `no_speech` | Inget tal hördes |
| `audio-capture` | `audio_capture` | Ingen mikrofon hittades |
| `aborted` (inte begärt) | `aborted` | Lyssningen avbröts |
| konstruktor saknas | `unsupported` | Tal → text stöds inte i den här webbläsaren |
| ej https (utom localhost) | `insecure` | Tal → text kräver en säker anslutning |
| allt annat, eller om `start()` kastar | `recognition_error` | Taligenkänningen fungerade inte |

En webbläsare utan stöd (till exempel Firefox) får ett lokaliserat
meddelande i stället för knappen och kraschar inte.

## Webbläsarstöd och integritet

- Taligenkänning finns i Chrome, Edge och Safari. Firefox saknar den.
- **Webbläsarens leverantör kan behandla ljudet.** Chrome skickar det till
  exempel till Googles taltjänst, och Safari kan använda Apples. Det står i
  integritetstexten under knappen, som knappen pekar på med
  `aria-describedby`. Viktkollen har ingen direkt kostnad för detta och inget
  avtal om det.

## Kostnad

**LOCAL / NO DIRECT VIKTKOLLEN PROVIDER COST.** Inget anrop går till
Viktkollens server, och ingen leverantör faktureras. Inga beslut om billing,
kvoter eller entitlements är fattade här.

## Produktbeslut som återstår

Kortet visar fortfarande **Premium** (`access: 'premium'` i `aiEarModes.js`).
Det är bara en etikett och ingen spärr: läget fungerar för alla som har AI
Örat. Eftersom det inte finns någon direkt kostnad för Viktkollen behöver
produkt/Cursor bestämma något av följande:

1. **Gratis.** Ändra `access` till `'free'` för `speech`. Det är en rad, plus
   de tester som låser mappningen i `aiEarModes.test.jsx`.
2. **Premium som produktval.** Då behöver en riktig gate byggas i Cursors
   entitlement-spår. Claude ändrar inte plan- eller billingdefinitioner.

Humma / sjung (`melody`) är fortfarande inte kopplat. Ljudigenkänning och
Fågelljud är oförändrade.
