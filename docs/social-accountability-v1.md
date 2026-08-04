# Social & Accountability V1

Social & Accountability V1 är ett lokalt, privacy-first socialt lager ovanpå befintliga modeller. Det ändrar inte auth, sync, backup, export, import, achievements, coach eller nutritionarkitektur.

## Moduler

- `friendEngine.js`: normaliserar vänner, invites och accountability partners.
- `privacyEngine.js`: visibility levels, anonymisering och privacy readiness.
- `shareEngine.js`: lokala share previews och lokala share tokens.
- `leaderboardEngine.js`: opt-in leaderboard med endast säkra sociala mått.
- `socialEngine.js`: samlar social readiness, sharing, achievements och insights.

## Privacy

Progress är privat som standard. Share previews sanerar e-post, id:n, rå vikt, bilder, auth och andra känsliga fält. Inga länkar skickas automatiskt.

## Leaderboard

Leaderboard är avstängd tills användaren aktivt väljer det. Den får inte använda vikt, viktminskning eller medicinsk data som rankingmått.

## Lagring

V1 lägger inte till någon ny lagringsnyckel. Modellerna kan konsumera ett `socialState`-objekt när ett framtida UI eller repository-adapter tillhandahåller det.
