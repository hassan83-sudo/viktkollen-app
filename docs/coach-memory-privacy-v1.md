# Coach Memory Privacy V1

## Dataminimering

Coachminnet sparar bara säkra kategorier, counts, confidence och metadata. Det sparar inte känslig fritext, rå historik, chatthistorik, bilder, prompts eller providerresponses.

## User Control

Personlig anpassning är användarkontrollerad. Remote memory context kräver separat opt-in och kan stängas av utan att radera lokal coachhistorik.

## User Isolation

Minnet ligger i samma user-scoped repository/syncflöde som befintlig adaptive coach feedback. Ingen global singleton med användardata används. Logout och user switch ska göra sena remote-resultat irrelevanta.

## AI Payload

Remote AI får endast minimerad `memoryContext`:

- coach style
- action size
- focus categories
- excluded categories
- några successful/declined/barrier categories
- safe recent context
- coverage/confidence

Ingen identifierare, timestampad råhistorik, auth/session eller localStorage skickas.
