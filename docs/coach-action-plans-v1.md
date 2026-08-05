# AI Coach Action Plans V1

## Nulage

Adaptive Coach hade redan regelbaserade rekommendationer, feedback, actions,
timeline, coach memory, insights, reminders och remote coach via den befintliga
`/api/adaptive-coach`-routen. Det saknades däremot ett samlat 7-dagarsläge som
visar vad användaren kan göra morgon, eftermiddag och kväll.

## Arkitektur

Action Plans V1 lägger inte till någon ny authmodell, databas, syncmodell,
backupmodell eller storage key. Planerna ligger bakåtkompatibelt i befintlig
adaptive coach-state:

`viktkollen.adaptiveCoach.v1 -> actionPlans`

Det gör att repository, Cloud Sync V3, backup/restore och export/import kan
återanvända samma adaptive coach-nyckel.

## Planmotor

`src/services/coachActionPlanEngine.js` bygger en deterministisk 7-dagarsplan
från:

- Adaptive Coach
- Coach Memory V8
- Insights
- Goals/Habits
- Reminders och quiet hours
- Health snapshot, vikt, mat och check-ins

Varje dag innehåller:

- Morgon
- Eftermiddag
- Kväll

Varje action innehåller prioritet, kategori, uppskattad duration, frivillig
reminder och completion state.

## Adaptiv planering

Planmotorn använder bara säkra lifecycle-signaler:

- upprepade skipped actions kortar duration och gör stegen lättare
- flera completed actions höjer utmaningen försiktigt
- accepted räknas inte som success
- skipped räknas inte som misslyckande

Planen får inte skapa extrema, skuldbeläggande eller medicinska råd.

## Remote AI

Remote AI kan bara få en minimerad plan-context när befintligt remote coach
consent finns. Payloaden innehåller bara counts, kategorier, confidence och
planstatus. Den innehåller inte rå planhistorik, användar-ID, auth/session,
prompts, providerresponses, rå viktlogg eller rå måltidshistorik.

Serverrouten sanerar plan-context med allowlist och behandlar den som opålitlig
client input.

## UI

`CoachPlanCenter.jsx` är lazy-loaded. Panelen visar:

- dagens plan
- veckans plan
- completed actions
- skipped actions
- adaptive changes
- confidence score
- regenerate plan
- varför actions valdes

## Export, Sync och Backup

Action plans ingår i befintlig exportsektion för Adaptive Coach och följer
samma storage key som övrig adaptive coach-state. Ingen separat syncmodell
eller backupmodell skapades.

## Release gate

`CoachPlanCenter` är tillagd i modulepreload-skyddet. Den ska inte hämtas som
initial modulepreload i production build.

## Begransningar

Planerna är regelbaserade och lokala. Remote AI kan formulera/refinera råd
endast efter användarens befintliga consent och aktiv begäran. Browsernotiser
skapas inte automatiskt från planstegen i V1; planstegen har bara frivillig
reminder-metadata som kan användas av befintliga reminderflöden.
