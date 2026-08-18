# Release, premium och betalningsberedskap V1

Den här sprinten definierar ett provider-oberoende entitlement-kontrakt utan
att påstå att betalning är live.

## Entitlement-baseline

- Alla användare startar som `free`.
- `premium` och `trial` kräver verifierad serverkälla innan de får aktiveras i
  produktion.
- Appen får aldrig härleda premium från en klientboolean, localStorage-flagga
  eller dev-preview.
- Dev-preview får bara användas i `import.meta.env.DEV`.

## Rekommenderad free/premium-modell

Gratis ska vara användbar:

- viktlogg
- check-in
- enkel nutrition
- begränsad AI Coach
- begränsad matscanning
- begränsad kroppsscanning
- export/import för egen dataportabilitet

Premium/trial bör bära dyrare och mer avancerade funktioner:

- avancerade AI-råd och veckoplaner
- Health Prediction
- avancerade insights
- längre historik och jämförelser
- cloud backup/sync
- högre server-side usage limits för AI/scanning

## Betalningsberedskap

Framtida betalbackend behöver minst:

- appens `userId`
- provider-oberoende `plan`
- provider-oberoende `status`
- `currentPeriodStart` och `currentPeriodEnd`
- `cancelAt`
- `providerCustomerId`
- `providerSubscriptionId`
- webhook-uppdaterad entitlement
- server-side verifiering innan premiumstatus returneras till klient

Webbbetalning kräver checkout, customer portal, webhook-signaturverifiering och
server-side entitlement-sync. App Store och Google Play kräver separat kvitto-
eller purchase-token-verifiering på servern samt restore purchase-flöde.

## Release-blockers

- Ingen riktig betalprovider är vald.
- Ingen server-side entitlement-tabell/API finns ännu.
- Ingen webhook-verifiering finns ännu.
- Premiumstatus får därför inte marknadsföras som live i produktion.

## AI-kostnadskontroll

Serverroutes ska ha Supabase-auth, user-scoped rate limit, säkra fel och
no-store headers. Slutlig premium/usage-enforcement måste ske server-side när
entitlement-backend finns.
