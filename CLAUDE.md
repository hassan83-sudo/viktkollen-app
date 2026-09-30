# Viktkollen – parallellt arbetssätt

Claude arbetar parallellt med Cursor och andra utvecklingsspår.

## Main och Production

När en vanlig UI-, bild- eller textändring är färdig och verifierad:

1. Hämta alltid senaste `origin/main` precis före integration.
2. Kontrollera att ändringen inte krockar med eller skriver över arbete som redan finns på `main`.
3. Kör relevanta tester, lint och build.
4. Jämför resultatet mot aktuell `main`. Befintliga fel på `main` behöver inte stoppa arbetet, men ändringen får inte introducera nya fel.
5. Om allt är säkert får den färdiga ändringen mergas/pushas till `main` så att Vercel Production uppdateras.
6. Använd aldrig force push på `main`.

## Konflikter

Om:
- merge/rebase ger konflikt,
- arbete från Cursor eller annat parallellt spår riskerar att skrivas över,
- nya lint-/testfel uppstår,
- build misslyckas,
- eller rätt lösning är osäker,

STOPPA och rapportera problemet.

Skriv inte över den andra agentens arbete för att lösa konflikten.

## Riskområden

Följande får INTE gå till `main`/Production utan användarens uttryckliga godkännande:

- billing
- abonnemang
- betalningar
- kvoter
- Supabase
- databas
- migrationer
- backend/API
- account deletion/kontoradering
- säkerhet
- AI Coach och röst
- Accessibility/tillgänglighet
- ändringar som berör ett annat aktivt parallellt spår

## Mobil/Vercel

`main` är versionen som Vercel Production bygger.

Målet med vanliga färdiga UI-/bild-/textändringar är därför:

Claude → verifiering → säker integration till `main` → Vercel Production → användaren kan stänga och öppna Viktkollen på mobilen och se den nya versionen.
