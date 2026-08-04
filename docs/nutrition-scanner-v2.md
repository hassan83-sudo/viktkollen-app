# Nutrition Scanner V2

## Nuläge

Viktkollen hade redan MealLogger, nutritionmotor, äldre fotoanalys och rapport-/dashboardflöden. Det äldre fotoflödet kunde skapa måltid direkt från bildanalys och hade historik som kunde innehålla bildpreview. Scanner V2 är därför byggd som ett nytt säkert reviewflöde ovanpå befintlig mealmodell.

## Scannerarkitektur

- `src/components/NutritionScannerV2.jsx` är lazy-loaded från `MealLogger`.
- `src/services/nutritionPhotoAnalysis.js` definierar analyskontrakt, review draft, dubblettkontroll, commit och usage summary.
- `src/services/nutritionPhotoPreprocessing.js` validerar och förbereder bild lokalt.
- `src/services/nutritionPhotoAnalysisProvider.js` abstraherar mock/local och remote-provider.

Ingen ny lagringsnyckel har lagts till.

## Image Lifecycle

Bild väljs via browserns file input med kamera/capture-stöd. Filen valideras mot MIME, filändelse och storlek. Preview använder temporär object URL som revokas vid byte, avbryt eller unmount. Originalbild, blob URL, base64 och EXIF/GPS sparas inte.

## Preprocessing

Preprocessing använder browser-API och canvas där det behövs för nedskalning. Om canvas saknas används filen temporärt utan permanent cache. Fel visas med svensk, icke-teknisk text.

## Provider

Mock/local provider ger en tydligt märkt demo-uppskattning. Remote-provider går via befintlig AI-service och skickar bara temporärt förberedd bild, språk, schema och eventuell måltidstyp. Ingen profil, historik, auth/session, diagnostics eller localStorage dump skickas.

Provider importeras först när användaren klickar på analysknappen.

## Payload Och Validering

Analysmodellen tillåter endast kända fält. Okända fält, script/HTML, överstora payloads och osäkra texter ignoreras eller neutraliseras. Näringsvärden begränsas till rimliga icke-negativa intervall. Ogiltig analys sparas inte.

## Confidence

Confidence kan vara `high`, `medium`, `low` eller `insufficient`. Låg eller otillräcklig confidence visas tydligt och kräver manuell granskning. Confidence beskriver teknisk uppskattning, inte medicinsk säkerhet.

## Review Och Edit

Användaren kan ändra måltidsnamn, typ, datum, tid, portion, ingredienser och näringsvärden innan save. Ingen persistence sker före bekräftelse. Dubbel-submit skyddas i komponenten.

## Nutrition Calculation

Commit använder befintliga `mealDraftToMeal`, `normalizeMeals` och nutrition override-fält. Sparad måltid får samma näringsformat som övriga faktiska måltider.

## Dubblettkontroll

Dubbletter jämförs deterministiskt på:

- samma `analysisId`
- nära tid
- måltidstyp
- namn
- liknande kalorier

Exact duplicate blockeras. Likely duplicate blockeras som standard. Possible duplicate kan bekräftas manuellt.

## Meal Commit

Vid bekräftelse skapas en faktisk måltid i befintlig mealmodell. Minimal metadata sparas på måltiden:

- `source: photoAnalysis`
- `analysisId`
- `providerType`
- `confidence`
- `userEdited`
- `analyzedAt`

Ingen bilddata, Blob URL eller base64 sparas.

## History Decision

Ingen separat analys-history införs. Fotoanalys-historik härleds från måltider med `photoAnalysis`-metadata.

## MealLogger Integration

MealLogger visar en knapp “Analysera matfoto”. Scannern laddas först när panelen öppnas. Efter save går måltiden in via `onMealsChange`, precis som övriga måltider.

## Coach, Dashboard Och Reports

Adaptive Coach använder sparad måltid som vanlig faktisk nutritiondata. Dashboard, Weekly Report och Monthly Report visar antal fotoanalyserade måltider, redigerade analyser och låg confidence-count. De visar inga bilder och ingen rå providerdata.

## Offline Och PWA

Scanner-UI, filval och preview fungerar offline. Remote analys är inaktiverad offline och visar tydlig fallback. Ingen service worker-ändring behövs, och inga bildpayloads cacheas av appen.

## Privacy Och Security

Scanner V2 förhindrar bilddata i localStorage, sync, backup, logger och rapporter. Den skickar inte auth/sessionfält och sparar inte EXIF/GPS. Analysobjektet är allowlistat och skyddat mot prototype pollution via filtrering av kända fält.

## Performance

Scanner-komponenten lazy-loadas. Provider laddas först vid analysklick. Ingen ny dependency har lagts till.

## Teststrategi

Tester täcker:

- filvalidering
- object URL revoke
- dimension scaling
- analysnormalisering
- unsafe text/base64-filtrering
- provider mock/offline
- review draft
- commit till mealmodell
- dubblettkontroll
- usage summary
- SSR-rendering utan tekniska värden
- lazy loading-kontrakt

## Manuella Testfall

- Ny användare utan måltider.
- Desktop filval med jpg/png/webp.
- Mobil kamera.
- Ogiltig MIME och spoofad filändelse.
- Stor bild.
- Offline preview och mock/manual flow.
- Remote analys avbruten eller timeout.
- Låg confidence och redigering.
- Exact/likely/possible duplicate.
- Save och öppna måltidshistorik.
- Dashboard, Weekly Report, Monthly Report och Adaptive Coach efter sparad måltid.
- Backup/restore och sync utan bilddata.

## Kända Begränsningar

Remote bildanalys kräver att befintlig backend/AI-route faktiskt stödjer `nutrition-photo-analysis`. Lokal fallback låtsas inte vara riktig AI. Scanner V2 sparar inga thumbnails och visar därför historik via måltidsloggen, inte bildgalleri.

## Nutrition Scanner V3

Möjliga nästa steg är bättre servervaliderad remote-provider, kameraflöde med live capture, mer detaljerad ingredient matching mot nutritiondatabasen och browserbaserade accessibility-flöden för hela reviewsteget.
