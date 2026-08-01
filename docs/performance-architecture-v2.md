# Performance Architecture V2

## Syfte

Performance Architecture V2 minskar onödig initial hämtning av stora feature- och servicechunks utan att ändra lagring, auth, backup, offline/PWA eller affärslogik.

## Baslinje Före Sprinten

Production build visade:

- `cloud-services`: 282.53 kB
- `react-vendor`: 189.63 kB
- `health-progress-services`: 143.66 kB
- `MealLogger`: 121.94 kB
- `index`: 102.60 kB

`dist/index.html` modulepreloadade `cloud-services`, `health-progress-services`, `react-vendor` och runtime. `MealLogger` var redan React.lazy men dess chunk innehöll flera avancerade nutritionvyer.

## Kartlagda Orsaker

- `cloud-services` blev stor eftersom manuell chunkning grupperade cloud/sync med delade auth- och storageberoenden. Den preloadades eftersom appskalet behövde delade moduler.
- `health-progress-services` blev stor eftersom manuell chunkning samlade health, progress och check-in-moduler. Flera av dessa används redan av dashboarden vid första renderingen, så hela gruppen blev initial.
- `MealLogger` blev stor eftersom den statiskt importerade dag-, vecka-, månad-, planner-, AI-plan- och receptvyer i samma lazy chunk.

## Ändringar

- Cloud/sync-tjänster laddas via `src/services/cloudRuntimeLoader.js`.
- `CloudStatusPanel` laddar `cloudSyncService` dynamiskt när status kontrolleras.
- `CloudSyncPanel` laddar `cloudSyncEngine` dynamiskt när status/sync behövs.
- Den manuella `cloud-services`-gruppen togs bort.
- Den manuella `health-progress-services`-gruppen togs bort eftersom den tvingade ihop för mycket.
- Nutrition manual chunk gjordes selektiv: endast Appens core (`mealCorrections`, `nutritionGoals`) ligger i `nutrition-core-services`.
- Avancerade MealLogger-flikar lazy-loadas:
  - `WeeklyNutritionDashboard`
  - `MonthlyNutritionDashboard`
  - `WeeklyMealPlanner`
  - `AIMealGenerator`
  - `RecipeManager`

## Slutlig Chunkbild

Efter sprinten:

- `cloud-services`: borttagen som preloadad monolit
- `cloudSyncService`: 16.29 kB, lazy
- `cloudSyncEngine`: 12.33 kB, lazy
- `MealLogger`: 72.10 kB
- `nutritionEngine`: 86.23 kB, lazy med avancerad nutrition
- `nutrition-core-services`: 37.42 kB, initial core
- `index`: 155.64 kB
- `react-vendor`: 189.63 kB
- `supabase-vendor`: 205.69 kB, initial eftersom auth kräver Supabase

Initial preload efter sprinten:

- `index`
- `react-vendor`
- `supabase-vendor`
- `healthCalculations`
- `nutrition-core-services`
- runtime

Cloud/sync, nutrition engine, avancerade nutritionflikar, AI-tjänster och övriga featurevyer laddas först via lazy/dynamic imports.

## Medvetet Lämnat

- `react-vendor` är kvar som separat initial vendor eftersom React krävs för appskalet.
- `supabase-vendor` är kvar initial eftersom Supabase Auth används innan användaren kommer in i appen.
- `healthCalculations` och nutrition core är kvar initialt eftersom dashboard, health snapshot och dagens måltidsdata behöver dessa värden direkt.
- Progressdata beräknas fortfarande i App för nuvarande dashboardkontrakt. En djupare V3 kan flytta mer progressanalys bakom featurehooks, men det kräver större komponentgränsarbete.

## Kontrakt

- Appskalet ska inte statiskt importera cloud/sync implementationer.
- Cloud-paneler ska använda `cloudRuntimeLoader`.
- `vite.config.js` ska inte återinföra stora monolitiska `cloud-services`, `health-progress-services` eller breda nutritionchunks.
- MealLogger ska inte statiskt dra in flikvyer som bara visas efter användarens val.

## Teststrategi

`src/performanceArchitectureV2.test.js` låser import- och chunkkontrakten så stora tjänster inte råkar flytta tillbaka in i appskalet.

## Begränsningar

Den totala initiala preloade storleken minskar framför allt genom att cloudmonoliten försvinner. Huvudchunken växer eftersom tidigare gemensam health/progress-kod inte längre göms i en stor preloadad manual chunk. Det är en bättre separation, men inte slutmålet för en framtida Performance Architecture V3.
