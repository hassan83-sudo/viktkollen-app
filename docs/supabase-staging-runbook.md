# Supabase Staging Runbook

Kör detta endast i staging tills Test User A/B och radering är verifierade.
Kör inte i produktion innan releaseansvarig har godkänt resultatet.

## Ordning

1. Kör `supabase/cloud_sync_v2.sql`.
2. Kör `supabase/entitlements_and_account_deletion.sql`.
3. Kör `supabase/release_acceptance_checks.sql`.

## Efter `cloud_sync_v2.sql`

Förväntat:

- `public.user_backups`, `public.user_sync_state`, `public.user_sync_events`
  och `public.user_sync_items` finns.
- RLS och Force RLS är aktiverat.
- Policies använder `auth.uid() = user_id`.
- `user_sync_items` har index/unikhet för `(user_id, storage_key)`.

Stoppa om:

- En tabell skapas i fel schema.
- RLS inte är aktivt.
- En policy innehåller `true` som user-scope.
- `anon` får läsa, skriva eller radera user data.

Destructive/read-write steg:

- SQL-filen innehåller idempotenta `alter table`, `drop policy if exists`,
  `drop trigger if exists` och backfill av saknat `user_id`.
- Kör bara efter backup/export av staging om staging redan har värdefull data.

## Efter `entitlements_and_account_deletion.sql`

Förväntat:

- `public.user_entitlements` finns med `user_id` som primary key.
- Tillåtna planer: `free`, `premium`, `trial`.
- Tillåtna statusar: `none`, `active`, `trialing`, `canceled`, `past_due`,
  `expired`, `grace_period`.
- RLS och Force RLS är aktiverat.
- Authenticated users har endast SELECT-policy för egen rad.
- Det finns ingen authenticated INSERT/UPDATE/DELETE-policy.

Stoppa om:

- Klientroll kan skriva `user_entitlements`.
- En entitlement-rad kan läsas mellan Test User A och B.
- Constraints accepterar okända plan/status-värden.

Destructive/read-write steg:

- Tabellen skapas om den saknas.
- Befintliga policies med samma namn droppas och återskapas.
- Ingen befintlig entitlement-data raderas av filen.

## Efter `release_acceptance_checks.sql`

Förväntat:

- Alla `table exists`-checks visar `pass = true`.
- RLS-listan visar `relrowsecurity = true` för alla user-owned tabeller.
- Policies visar `auth.uid() = user_id`.
- Checken `entitlement client write policy absent` visar `pass = true`.

Stoppa om:

- Någon user-owned tabell saknas.
- Någon tabell saknar RLS.
- `user_entitlements` har authenticated write policy.
- Policies ger cross-user access.

## Production

Kör inte `ACCOUNT_DELETION_ENABLE_AUTH_DELETE=true` i production förrän staging
har bevisat cloud deletion, auth deletion och recovery. Kör inte nya SQL-filer i
production förrän staging-runbooken är grön och aktuell backup finns.
