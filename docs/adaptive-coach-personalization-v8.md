# Adaptive Coach Personalization V8

## Syfte

Adaptive Coach Personalization V8 lägger ett säkert, regelbaserat minneslager ovanpå befintlig Adaptive Coach. Det skapar ingen ny coach, ingen ny auth, ingen ny databas och ingen ny syncarkitektur.

## Memorymodell

Minnet ligger under befintlig coachstate `viktkollen.adaptiveCoach.v1` som `coachMemory`.

Tillåtna kategorier:

- preferences
- activePriorities
- successfulStrategies
- declinedStrategies
- recurringBarriers
- recentContext
- coachStyle
- adaptationMetadata

Minnet innehåller kategorier, counts, confidence, lifecycle och korta säkra sammanfattningar. Det innehåller inte rå historik, user ID, device ID, auth/session, prompts, providerresponses, bilder eller chatthistorik.

## Lokal Och Remote Användning

Lokal regelbaserad coach fungerar utan personalization och utan remote memory. Remote AI får memory context endast när:

- remote AI är aktiverad för coach
- användaren gör ett aktivt knapptryck
- personalization är på
- remote memory context är på
- serverroute auth, schema, rate-limit och safety passerar

## Builder

`coachMemoryBuilder` bygger memory deterministiskt från:

- adaptive coach feedback
- action lifecycle
- timeline/patterns/strategy
- goals/habits/reminders via befintliga sammanfattningar

Accepted betyder inte successful. Success kräver completed/outcome-signal. Dismissal blir inte permanent preferens från en enskild händelse.

## Context Selection

`coachContextSelector` väljer minsta relevanta context för aktuell coachrequest. Den prioriterar uttryckliga preferenser, aktuell kontext, high-confidence och icke-stale memory. Exkluderade fokusområden filtreras bort.

## Lifecycle Och Decay

Memory items har lifecycle som created, reinforced, weakened, stale, forgotten, userConfirmed, userEdited och userRejected. Stale items skickas inte till remote AI.

## Forget Och Reset

Användaren kan:

- glömma en härledd post
- glömma alla härledda poster
- ändra coachton
- ändra actionstorlek
- ändra fokusområden
- stänga av personalization
- stänga av remote memory

Originaldata som vikt, måltider och mål påverkas inte.

## Kända Begränsningar

- Memory bygger på befintliga signaler och kan vara insufficient vid låg coverage.
- Global server-side memorylagring införs inte.
- Remote providerverifiering kräver staging med giltig session och explicit testacceptans.
