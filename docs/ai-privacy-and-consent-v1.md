# AI Privacy & Consent V1

## Grundregel

Regelbaserad coach fungerar alltid utan remote AI. Remote AI kräver aktiv användarhandling och separat opt-in i Adaptive Coach.

## Consent

Coach-consent sparas som minimal metadata i befintlig `adaptiveCoachFeedback`-modell:

- `coachRemoteEnabled`
- `consentedAt`
- `updatedAt`
- `policyVersion`

Ingen auth/session, prompt eller providerresponse sparas.

## Dataminimering

Coachpayload innehåller bara:

- analysisDate
- period
- coverage/confidence
- sammanfattade metrics
- highlights
- attention items
- säkra mål/vanor
- frivillig explicit fråga

Skickas inte:

- e-post
- session
- token
- deviceId
- raw meals
- full viktlogg
- raw check-in history
- bilder
- base64
- chat history
- localStorage
- diagnostics
- exportdata

## UI

Adaptive Coach visar en sammanfattning av vilken datatyp som skickas. Rå JSON visas inte som standard.

## Återkallelse

Användaren kan stänga av remote AI. Då fortsätter regelbaserad coach att fungera.
