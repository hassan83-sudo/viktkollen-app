# A11Y-8Z2: Språk, tal och i18n

Start: `59b26b1`. `origin/main` står kvar på `462c945` (Cursor, billing).
Det är bara noterat, inget är mergat. Fynden är B10 och B-N4 från 8T och 8Y.

## B10: inventering

| Kategori | Fil och funktion | Före | Appens språk hämtas från | Efter |
|---|---|---|---|---|
| **A. Taligenkänning** | `voiceConversationController.js`, `startListening` | `recognition.lang = 'sv-SE'` alltid | `document.documentElement.lang` (sätts av `i18n/index.js`) | `getSpeechLocale(getLanguage())` |
| **B. Talsyntes** | `voiceConversationController.js` (AI-röstens svar), `selectSpeechSynthesisVoice` | Valde alltid svenska röster; reserv `sv-SE` | samma | Väljer röster på appens språk. Reserv `getSpeechLocale(språk)`. Svenska är fortfarande standard om inget språk ges. |
| B. Talsyntes | `AiCoachOverlay.jsx` (skrivna svar) | samma | `document.documentElement.lang` | samma som ovan |
| B. Talsyntes | `accessibilitySpeech.js`, `NoticeHub`, `NoticeKitchenTimers`, `notificationSchedulerBridge` | Följde redan språket (reserv `sv-SE` bara om inget språk finns) | – | oförändrat |
| B. Talsyntes | `bodyAnalysisVideoScan.js:590` | `sv-SE` | – | **BLOCKED — CURSOR-OWNED** (Body Scan) |
| **C. Synlig text** | `PlaceSection.jsx` | Trygghetslarmets 6 val, incheckningens 3 val, rubriken "Trygghetslarm", "Vad har hänt?", "Skicka snabbt ett larm …", "Skickar …", "Trygghetslarm skickat …", "… skickat till familjen.", "Senaste trygghetslarm i familjen", "Platsdelning aktiv" med följetext, platsnotisernas växlar ("Platsnotiser", "Notis när …", "Aktiv i appen"/"Av"), "Pushnotiser:" och statusen | `useTranslation('place')` | i18n (`place.safetyAlert`, `checkin`, `push`, `notice`, `sharingStatus`, `safePlaceNotifications`), på svenska och engelska |
| **D. aria-label och status** | `PlaceSection.jsx` (dialognamnet "Trygghetslarm", statustexter), `PlaceVoiceCallPanel.jsx:32` (`aria-label` "Prata med {namn}") | hårdkodat | `useTranslation('place')` | i18n (`place.safetyAlert.title`, `place.voiceCall.aria`) |

**Pushstatus:** `placePushService` returnerar fortfarande en svensk `label`.
UI:t visar nu texten utifrån `status` (`active`, `inactive`, `denied`,
`unsupported`, `unknown`) via `place.push.*`, så tjänsten behövde inte ändras.

### Språktaggar för tal (`getSpeechLocale`)

| Appens språk | Tagg |
|---|---|
| sv | sv-SE |
| en | en-US |
| da | da-DK |
| no | nb-NO |
| fi | fi-FI |
| ar | ar-SA |
| zh-CN | zh-CN |
| zh-TW | zh-TW |
| ja | ja-JP |
| ko | ko-KR |
| de | de-DE |
| fr | fr-FR |
| es | es-ES |
| it | it-IT |
| pt | pt-PT |
| nl | nl-NL |
| pl | pl-PL |

- **Övriga språk som appen stöder** men som inte är kompletta (cs, hu, ro, el,
  tr, uk, he, hi, id, vi, th och ms) får koden som den är. Det är giltiga
  språktaggar.
- **Okänt eller saknat språk:** appens standardspråk, alltså `sv` och
  `sv-SE`. Svenska används bara när inget annat språk som stöds är valt.
- Bara språk som finns i `i18n/languages.js` mappas.

## B-N4

- **Orsak:** `MoreSection` läser namnrymden `settings`. Sju felrubriker
  (`nutritionError`, `coachError`, `wellbeingError`, `economyError`,
  `signLanguageError`, `animalWorldError` och `pregnancyFirstYearError`) fanns
  inte där. Några av dem fanns bara under `journey`.
- **Följden:** konsolen varnade i varje körning, och `defaultValue` på svenska
  visades även när appen körde på engelska.
- **Efter:** alla sju ligger i `settings`, på svenska och engelska. De svenska
  `defaultValue` är borttagna i `MoreSection`.
- **Ägare:** det är containerns felrubriker, inte Cursors kod för billing eller
  kontoradering i Inställningar. **FIXED.**

## Tester

- **`src/services/accessibilitySpeechLanguage.test.js`**, nytt, 4 tester:
  - språktaggarna;
  - att varje språk som stöds får en giltig tagg, och reserven (tomt, saknat
    och okänt ger `sv-SE`);
  - taligenkänningen i kontrollern: sv ger sv-SE, en ger en-US, de ger de-DE,
    och tomt ger sv-SE;
  - att syntesrösten följer språket.
- **`src/services/accessibilityLanguageI18n.test.js`**, nytt, 3 tester:
  - de flyttade Plats-texterna finns på svenska och engelska, även alla 6
    larmval och 5 pushstatusar;
  - de B10-strängar som var hårdkodade finns inte längre i `PlaceSection`
    eller `PlaceVoiceCallPanel`. Kontrollen gäller exakt listan, i exakt de
    filerna, så det är ingen global textsökning;
  - B-N4: `MoreSection` använder exakt 10 felnycklar, alla finns i `settings`
    på svenska och engelska, och det finns ingen svensk `defaultValue`.
- **`dialogIntegration.test.jsx`:** källkontrollen för trygghetslarmet hittar
  nu dialogen via `aria-label={t('safetyAlert.title')}` i stället för den
  hårdkodade texten. Samma kontrakt gäller: Escape är blockerad medan larmet
  skickas, och fokus ligger på dialogen.
- **Regressioner:**
  - `place-cards`, `keyboard` (även walkie-talkie), `ai-coach`, `axe-views`
    och `label-in-name`: 55 av 55 godkända i Chromium, med axe 0 på Plats.
  - Komponenttester i 21 filer: inga nya fel. De 21 fel som visas finns redan i
    baslinjen.
- **Negativt bevis:** med `recognition.lang = 'sv-SE'` hårdkodat igen och
  appen på engelska faller testet ("expected 'sv-SE' to be 'en-US'"). Det är
  återställt.
- **Ingen global gate** för hårdkodad svenska. Den skulle ge falsklarm på
  testdata, kommentarer och resurser. Källkontrollen ovan är avgränsad till
  B10-strängarna.

**Inte körda:** hela `test:a11y:e2e` och hela Vitest, eftersom checkpointen i
8Y var grön.

## Status

**B10: PARTIAL.** Det som 8T och 8Y räknade till B10 är åtgärdat:
taligenkänningen, syntesrösten och reserven i AI-rösten, samt de listade
Plats-texterna och `aria-label`. Kvar:
- **BLOCKED — CURSOR-OWNED:** talsyntes med `sv-SE` i Body Scan
  (`bodyAnalysisVideoScan.js:590`).
- **Övrig hårdkodad svenska, utanför avgränsningen:** reservtexter för fel i
  `PlaceSection` (`error?.message || '… kunde inte …'`) och övriga texter
  där (säkra platser, historik, batteri); samtalsstatus i
  `PlaceVoiceCallPanel` ("Ansluter ljud…" m.fl.); statustexter i
  `voiceConversationController` ("Lyssnar…" m.fl.); dialogtexter i de filer
  som redan hade hårdkodad svenska (8X4–8X6). `i18n:hardcoded` prioriterar dem
  inte (0 signaler).

**B-N4: FIXED.**
