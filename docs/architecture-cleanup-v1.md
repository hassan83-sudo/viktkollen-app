# Dead Code, Legacy Paths & Architecture Cleanup V1

Den här sprinten städar gamla kodvägar utan att ändra användarbeteende.

## Borttaget

- `makeLegacyNutritionDashboardProgress` togs bort från
  `components/nutritionDashboard/nutritionDashboardViewModel.js`.
  Den var en oanvänd wrapper runt den centrala nutrition-progresslogiken.

## Förenklat

- `aiCoach/coachAppContext.js` använder nu `localDate.js` direkt för lokala
  datum, entry-datum, sorteringstid och parsing. Tidigare lokala pass-through
  helpers togs bort.

## Kvarvarande Adapters

- `checkInWorkout.js` finns kvar som bakåtkompatibel re-export av
  `normalizeWorkout` från `checkInNormalization.js`.
- `coachAppContextInternals` finns kvar för befintliga regressionstester och
  äldre AI Coach-testhjälpare.
- Repository-, sync- och backupmoduler får fortsatt läsa storage direkt. Det är
  deras ansvar. Konsumenter av aktuell vikt, dagens måltider och dagens check-in
  ska använda `healthSnapshot` eller App-state som skickats in från `App.jsx`.

## Importregler

Arkitekturtester låser att:

- centrala moduler kan importeras isolerat
- centrala moduler inte importerar UI/React åt fel håll
- `localDate` inte importerar dashboard eller AI-lager
- `healthFormatting` inte importerar React eller dashboardkod
- `checkInNormalization` inte importerar AI-lager
- centrala moduler inte har cirkulära beroenden sinsemellan
