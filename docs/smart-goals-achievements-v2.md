# Smart Goals & Achievements V2

## Arkitektur

Smart Goals & Achievements V2 är ett härlett motivationslager ovanpå befintliga data. Det skapar ingen ny målmodell, ingen ny auth, ingen ny databas och ingen ny syncmodell.

Nya motorer finns i `src/services/achievements/`:

- `achievementDefinitions.js`: säkra, statiska definitioner.
- `achievementSafety.js`: blockerar skam, straff, extrema beteenden och aggressiv gamification.
- `achievementEngine.js`: samlar härledda achievements, coverage, confidence och sammanfattning.
- `milestoneEngine.js`: bygger viktmålens delmål från central viktdata.
- `challengeEngine.js`: föreslår max tre små, frivilliga och säkra utmaningar.
- `xpEngine.js`: räknar låg och capped XP utan valuta, ranking eller leaderboard.
- `achievementLedger.js`: normaliserar kvittenser och historik.

## Lagring

Achievements använder befintlig goals/habits-nyckel:

`viktkollen.goalsHabits.v2`

Det som får sparas är begränsat till metadata:

- `achievements.unlocked`
- `achievements.acknowledged`
- `achievements.events`
- `achievements.xpLedger`
- `achievements.challengeHistory`
- `achievements.settings`

Själva statusen för achievements räknas om deterministiskt från aktuell appdata.

## Integrering

Achievement Center lazy-loadas i appens AI/coach-yta och använder befintliga props från `App.jsx`. Health Dashboard, Weekly Report och Monthly Report får en lätt sammanfattning från samma motor.

Data Export V2 visar achievements som valbar sektion, men exporterar samma goals/habits-nyckel. Import, backup och Cloud Sync behöver därför ingen ny modell.

Launch Readiness visar achievement engine health, coverage och nivå.

## Säker motivation

Systemet får inte belöna:

- låg kalorikonsumtion
- svält eller överhoppade måltider
- extrem viktminskning
- skuld, skam eller straff
- ranking, valuta eller leaderboard

Challenges är frivilliga och sparas först när användaren aktivt startar eller avfärdar dem.

## Begränsningar

V2 använder bara regelbaserad lokal analys. Den hittar inte på data och visar lägre confidence när underlaget är tunt. XP är endast en mild progressindikator och ska inte användas som tävlings- eller belöningssystem.
