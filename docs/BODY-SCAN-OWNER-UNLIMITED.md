# Obegränsad kroppsscanning för ägarens testkonto

Samma modell som `docs/FOOD-SCAN-OWNER-UNLIMITED.md`, men en egen flagga för `body.scan`.
Koden gör ingenting förrän båda stegen nedan är gjorda.

## Hur det fungerar

Vid varje kroppsscanning prövar servern (`api/_shared/billing/bodyScanOwnerExemption.js`):

1. Serverflaggan `BODY_SCAN_OWNER_UNLIMITED` är exakt `true` i den aktuella Vercel-miljön.
2. Användaren är verifierad via Supabase Auth (JWT).
3. Användar-id:t har ACTIVE `billing_admin` i `billing.admin_permissions` (läst med service role via
   `billing.has_billing_admin`). E-post, headers och formulärfält från klienten ignoreras.
4. Dygnstaket är inte nått: `BODY_SCAN_OWNER_DAILY_CAP` (standard 50, max 200) per rullande 24 h,
   räknat i `billing.usage_events`.

Då räknas scanningen inte mot månadskvoten. Annars, och vid alla fel, gäller vanlig kvot.
Inloggning, bildsamtycke, rate limit (`BODY_ANALYSIS_RATE_LIMIT_MAX`), kill switches, riktig AI
(ingen mock) och användningsloggning gäller alltid. Matscanning och AI-Ögat påverkas inte.

## Aktivering

1. **Supabase SQL Editor** (en gång; Preview och Production delar projekt):

   ```sql
   select id, email from auth.users where email = 'hassan83@live.se';
   insert into billing.admin_permissions (user_id, permission, status)
   values ('<user-id från raden ovan>', 'billing_admin', 'ACTIVE')
   on conflict do nothing;
   select billing.has_billing_admin('<user-id>');  -- ska ge true
   ```

   Obs: `billing_admin` ger också åtkomst till adminfunktionerna i `/api/billing/admin`.

2. **Vercel → Settings → Environment Variables → Preview**, gärna begränsad till grenen
   `fix/body-scan-analyze-button-20261015`: `BODY_SCAN_OWNER_UNLIMITED=true`. Gör sedan en
   redeploy av Preview.

Kontroll: Vercel-loggen visar `[api/body-analysis] Owner quota exemption` med `applied: true`,
och Mer → Abonnemang & användning visar "Obegränsad kroppsscanning".

## Avaktivering

Ta bort flaggan i Vercel och gör en redeploy, eller
`update billing.admin_permissions set status = 'REVOKED' where user_id = '<user-id>';`
