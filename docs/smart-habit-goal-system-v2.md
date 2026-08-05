# Smart Habit & Goal System V2

Smart Habit & Goal System V2 ar ett adaptivt, regelbaserat lager ovanpa befintliga mal och vanor.

## Arkitektur

Ny central motor:

- `src/services/smartHabitGoalEngine.js`

Ny lazy UI:

- `src/components/HabitGoalCenter.jsx`

Motorn ateranvander:

- Goals/Habits V3 state
- Health Journey V1
- Prediction Engine
- Adaptive Coach och Coach Action Plans
- Nutrition Coach
- Shared Analytics
- Health Dashboard och rapportmodeller

Den skapar ingen ny auth, databas, syncmodell, backupmodell eller lagringsnyckel.

## Funktioner

- analyserar befintlig historik via aggregerade motorer
- foreslar realistiska veckomal
- foreslar dagliga vanor
- justerar svarighetsgrad efter faktisk foljsamhet
- kopplar forslag till Coach Action Plans och Nutrition Coach
- visar sannolikhet att na veckomalet via Prediction Engine
- ger confidence, coverage och limitations

## Persistence

Forslag ar derived-only. De sparas inte forran anvandaren sjalv skapar mal, vana eller veckofokus i befintliga malpanelen.

All fortsatt lagring gar via:

- `viktkollen.goalsHabits.v2`

## AI

AI-funktionen ar consent-gated. Minimal payload far bara innehalla:

- sammanfattning
- malkategori
- vana
- confidence
- limitations

Blockerat:

- historik
- auth/session
- prompts
- provider responses
- bilder
- radata

## Release

`HabitGoalCenter` ar lazy-loaded och ska inte modulepreloadas. Release-gaten kontrollerar detta.

## Begransningar

- Inga forslag skapar automatiskt mal eller vanor.
- Sannolikhet ar stodjande och regelbaserad, inte en garanti.
- Saknad data ger enklare forslag och lagre confidence.
