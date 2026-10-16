# Obegränsad kroppsscanning för ägarens testkonto

Samma modell som `docs/FOOD-SCAN-OWNER-UNLIMITED.md`, men en egen flagga för `body.scan`.
Koden gör ingenting förrän båda stegen nedan är gjorda.

## Hur det fungerar

Vid varje kroppsscanning prövar servern (`api/_shared/billing/bodyScanOwnerExemption.js`):

1. Serverflaggan `BODY_SCAN_OWNER_UNLIMITED` är exakt `true` i den aktuella Vercel-miljön.
2. Användaren är verifierad via Supabase Auth (JWT).
3. Användar-id:t står i servervariabeln `BODY_SCAN_OWNER_USER_IDS` (ger inga adminrättigheter),
   eller har ACTIVE `billing_admin` i `billing.admin_permissions` (läst med service role via
   `billing.has_billing_admin`). E-post, headers och formulärfält från klienten ignoreras.
4. Dygnstaket är inte nått: `BODY_SCAN_OWNER_DAILY_CAP` (standard 50, max 200) per rullande 24 h,
   räknat i `billing.usage_events`.

Då räknas scanningen inte mot månadskvoten. Annars, och vid alla fel, gäller vanlig kvot.
Inloggning, bildsamtycke, rate limit (`BODY_ANALYSIS_RATE_LIMIT_MAX`), kill switches, riktig AI
(ingen mock) och användningsloggning gäller alltid. Matscanning och AI-Ögat påverkas inte.

## Aktivering (rekommenderat, utan adminrättigheter)

1. **Supabase → SQL Editor**, hämta användar-id (endast läsning):

   ```sql
   select id, email, email_confirmed_at from auth.users where email = 'hassan83@live.se';
   ```

2. **Vercel → Settings → Environment Variables**, miljö **Preview**, gren
   `fix/body-scan-analyze-button-20261015`:
   - `BODY_SCAN_OWNER_UNLIMITED` = `true`
   - `BODY_SCAN_OWNER_USER_IDS` = `<id från steg 1>`

   Variablerna läses bara på servern och hamnar aldrig i frontend-bundlen (de saknar `VITE_`).
   Gör sedan **Redeploy** av senaste Preview för grenen.

Alternativ: har kontot redan `billing_admin` räcker `BODY_SCAN_OWNER_UNLIMITED=true`
(`select billing.has_billing_admin('<id>');` ska då ge true).

Kontroll: Vercel-loggen visar `[api/body-analysis] Owner quota exemption` med `applied: true`,
och Mer → Abonnemang & användning visar "Obegränsad kroppsscanning".

## Avaktivering

Ta bort `BODY_SCAN_OWNER_UNLIMITED` (och `BODY_SCAN_OWNER_USER_IDS`) i Vercel och gör en redeploy.
