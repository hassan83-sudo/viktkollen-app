# Health Snapshot Contract

`healthSnapshot` är Viktkollens centrala faktakälla för aktuell hälsodata i UI,
AI Coach, rapporter, nutritionvyer och progressanalys. Konsumenter ska använda
snapshoten när de behöver samma fakta och ska inte läsa `localStorage` direkt
för aktuell vikt, dagens måltider eller dagens check-in.

## Struktur

Snapshoten returneras av `buildHealthSnapshot(data)` och innehåller:

- `date`: lokalt kalenderdatum som `YYYY-MM-DD`.
- `weight`: viktfakta, trenddata och vikt-display.
- `nutrition`: faktisk nutrition och dagens måltider.
- `checkIn`: dagens normaliserade check-in och displayetiketter.
- `periods`: fasta perioder för 7 och 30 dagar.
- `availability`: booleska flaggor för om huvuddata finns.
- `display`: säkra användartexter för toppnivåvärden.

## Råvärden Och Display

Råvärden ska vara nummer eller `null` när data saknas. Displayfält ska vara
svenska användartexter och får aldrig visa `undefined`, `null`, `NaN`,
`Infinity`, `true`, `false` eller `[object Object]`.

`sanitizeHealthSnapshotDisplay(snapshot)` sanerar endast displayfält. Den ändrar
inte numeriska råvärden.

## Viktregler

`weight.current` är senaste representativa dagsvikt. `weight.start` är startvikt
från den normaliserade viktkällan. `weight.goal` är målvikt när den finns.

Regler:

- `weight.totalChange = weight.current - weight.start`
- `weight.facts.goalRemaining = weight.current - weight.goal`
- flera vägningar samma lokala kalenderdag representeras av dagens senaste post
- framtida kalenderdagar räknas inte
- historikvyer får visa råa vägningar, men analys och rapporter ska använda
  `weight.dailyWeights`

## Måltidsregler

`nutrition.actualMeals` är deduplicerat faktiskt intag från `meals` och
`mealHistory`. Planerade måltider får inte ingå. `nutrition.mealsToday` filtreras
på snapshotens lokala `date`.

Regler:

- samma måltid i två källor räknas en gång
- `nutrition.mealCountToday = nutrition.mealsToday.length`
- `caloriesToday`, `proteinToday` och `fiberToday` är finita, icke-negativa tal
- planerade måltider räknas inte som intag

## Check-In-Regler

`checkIn.latestToday` är den senaste check-in-posten på snapshotens lokala datum.
Flera check-ins samma dag hanteras genom att senaste tid vinner. Energi, humör,
sömn, steg och träning normaliseras via den centrala check-in-normaliseringen.

Displayfält ska visa svenska etiketter, exempelvis `Saknas` eller
`Träning markerad`, inte råa enum-, boolean- eller objektvärden.

## Periodregler

`periods.sevenDays` innehåller valt datum och sex föregående lokala
kalenderdagar. `periods.thirtyDays` innehåller valt datum och 29 föregående
lokala kalenderdagar. Periodförändringar bygger på representativa dagsvikter,
inte alla råa vägningar.

## Availability

`availability` innehåller booleska flaggor:

- `weight`
- `weightGoal`
- `mealsToday`
- `nutritionGoals`
- `checkInToday`

Flaggorna beskriver om snapshoten har användbar data, inte om en UI-sektion ska
döljas.

## Konsumentregler

Konsumenter får:

- läsa råvärden från `weight`, `nutrition` och `checkIn`
- visa färdiga texter från `display` eller respektive undersektion
- använda `periods` för 7- och 30-dagarsrapportering

Konsumenter ska inte:

- läsa `localStorage` direkt för samma fakta
- räkna om `totalChange`, `goalRemaining`, `mealsToday` eller dagens nutrition
  när snapshoten redan finns
- blanda snapshotvärden med äldre separata props så att olika delar visar olika
  fakta
- mutera snapshotens källdata eller använda displaytexter för trendanalys

## Indata Från App.jsx

`App.jsx` bygger snapshoten från aktuell React-state:

- `profile`
- `weights`
- `meals`
- `photoMeals` som `mealHistory`
- `checkIn`
- `nutritionGoals`
- `selectedMealDate` som `today`

Cloud restore/import/sync ska uppdatera React-state efter lyckad storageändring
så att snapshoten blir färsk utan manuell sidladdning.

## Integritet

`validateHealthSnapshot(snapshot)` returnerar alla kontraktsfel.
`assertHealthSnapshotIntegrity(snapshot)` kastar ett tydligt fel vid brott.
I development/test validerar buildern snapshoten. I production saneras display
med säkra fallbackvärden så att användaren inte ser tekniska värden.
