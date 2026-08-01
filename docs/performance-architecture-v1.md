# Performance Architecture V1

Den här sprinten minskar Viktkollens initiala JavaScript-chunk utan att ändra appens affärslogik, dataformat, Supabase Auth, Cloud Backup/Restore eller AI Coach-svar.

## Nuläge Före

Mätt med `npm run build` före arkitekturändringarna:

- `src/App.jsx`: 2611 rader
- huvudchunk: `index-CRQ1AI3d.js`, 834,67 kB
- största lazy chunks:
  - `MealLogger`: 121,84 kB
  - `ProgressPhotos`: 42,51 kB
  - `ProgressCenter`: 29,92 kB
  - `CloudBackupPanel`: 15,64 kB
  - `ProgressDashboard`: 12,50 kB
- Vite visade chunk size-varning över 500 kB.

Grundorsaken var att `App.jsx` fortfarande statiskt importerade mycket service-, state- och shell-logik. Lazy-loading av paneler hjälpte, men initialgrafen bar fortfarande stora delade serviceområden.

## Arkitekturändringar

App-skalets rena presentation har flyttats till små komponenter:

- `src/components/app/AppLoadingScreen.jsx`
- `src/components/app/AppTopbar.jsx`
- `src/components/app/BottomNavigation.jsx`
- `src/components/app/OnboardingScreen.jsx`
- `src/components/app/LazySectionFallback.jsx`

`App.jsx` behåller orkestrering, state och befintliga callbacks, men har mindre inline-markup. Det minskar risken för att fler featurevyer växer in i huvudkomponenten.

## Lazy Loading

PWA V2:s lazy-loading behålls för tunga featurepaneler:

- AI Coach-rapport
- streckkodsskanner
- Cloud Backup
- Måltidscenter
- Månadsrapport
- Progress Center
- Smart Progress Dashboard
- Progress Photos
- Reminder Settings

Fallbacken är nu en egen komponent med `role="status"` och `aria-live="polite"`.

## Chunk-Strategi

`vite.config.js` har en begränsad `manualChunks`-strategi:

- `react-vendor`
- `supabase-vendor`
- `ai-services`
- `nutrition-services`
- `health-progress-services`
- `cloud-services`

Syftet är att dela tydliga serviceområden utan att skapa många mikroskopiska chunks. Service workern cachar fortfarande byggda assets via samma `/assets/`-regel, så PWA update/offline-flödet påverkas inte.

## Resultat Efter

Mätt med slutlig `npm run build`:

- `src/App.jsx`: 2472 rader
- huvudchunk: `index-DCFhPaPo.js`, 109,01 kB
- största chunks:
  - `ai-services`: 303,36 kB
  - `cloud-services`: 233,87 kB
  - `react-vendor`: 189,63 kB
  - `MealLogger`: 121,90 kB
  - `index.css`: 80,03 kB
- Vite chunk size-varningen är borta.

## Tester

Nya appskaltester täcker:

- loading shell
- onboardingfält
- topbar och disclaimer
- bottom navigation
- Suspense fallback

## Kända Begränsningar

Initial total nedladdning kan fortfarande omfatta flera chunks när App behöver statiskt importerade serviceområden direkt. Den största kvarvarande servicechunken är `ai-services`, eftersom App använder AI-relaterade servicefunktioner i chatt- och rapportflöden.

## Rekommenderat Nästa Arbete

- Flytta AI-chatthändelser till en egen hook med dynamiska serviceimports.
- Dela Cloud Sync/Backup-serviceytor tydligare om molnflöden växer.
- Undersök om nutrition- och progressberäkningar kan importeras när deras vyer aktiveras.
- Inför lättare bundle-budget i CI så chunk-storlekar inte växer obemärkt.
