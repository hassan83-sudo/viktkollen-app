# Viktkollen Privacy Data Inventory V1

Teknisk inventering för release-readiness. Detta är inte juridisk rådgivning.

## Lokal data

Viktkollen lagrar appdata i webbläsarens storage via `src/services/userDataRepository.js`.
Kända user-scoped nycklar omfattar profil, vikt, check-in, måltider,
nutrition goals, scannerhistorik, kroppsscanning, progress, påminnelser,
coachminne, rapporter, recept, shoppinglistor och sync/backup-metadata.
Auth/sessiondata hanteras av Supabase-klienten och ingår inte i export eller
lokal Viktkollen-radering.

## Supabase data

Kända Supabase-tabeller i nuvarande releaseunderlag:

- `user_backups`
- `user_sync_state`
- `user_sync_events`
- `user_sync_items`
- `user_entitlements`

Alla user-owned rader ska vara scoping via `user_id = auth.uid()` i RLS.
Entitlement-rader får läsas av användaren men skrivs server-side av admin- eller
framtida billingflöden.

## AI data

AI-routes ska bara ta emot minimerad appkontext eller temporära bilder som krävs
för vald funktion. Auth verifieras via Bearer-token på servern. API-nycklar,
Supabase-sessioner, tokens och rå localStorage ska inte skickas till AI.

## Deletion contract

`/api/account-deletion` har tre lägen:

- `dry-run`: returnerar server-readiness utan att radera.
- `cloud-data`: raderar kända user-owned Supabase-rader via server-side admin.
- `account`: raderar cloud data först och auth-user sist när
  `ACCOUNT_DELETION_ENABLE_AUTH_DELETE=true`.

Känd cloud-radering omfattar `user_entitlements`, `user_sync_items`,
`user_sync_events`, `user_sync_state` och `user_backups`. Okända framtida tabeller
måste läggas till i deletion-kontraktet innan release.

## Export

Export använder allowlistad lokal Viktkollen-data och sanitizer. Rå auth,
session, token, Supabase credentials, blob URL, data URL och diagnostics ska inte
ingå i exportpayload.
