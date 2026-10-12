# Obegränsad matscanning för ägarens administratörskonto

Branch: `claude/food-scan-owner-unlimited`. Inget är aktiverat i Preview, Production eller databasen.

## Hur det fungerar

Vid varje matscanning prövar servern (`api/_shared/billing/foodScanOwnerExemption.js`):

1. Serverflaggan `FOOD_SCAN_OWNER_UNLIMITED` är exakt `true` i den aktuella Vercel-miljön.
2. Användaren är verifierad via Supabase Auth (JWT) – samma kontroll som alla scanningar.
3. Användaren har ACTIVE `billing_admin` i `billing.admin_permissions`, läst med service-role via
   `billing.has_billing_admin` (befintlig BILL-4A-lösning). Klienter kan varken läsa eller skriva
   tabellen; ingen app-väg ger behörigheten. Headers, formulärfält och klientflaggor ignoreras.
4. Dygnstaket är inte nått: högst `FOOD_SCAN_OWNER_DAILY_CAP` scanningar (standard 100, max 500)
   per rullande 24 h, räknat varaktigt i `billing.usage_events`.

Är allt uppfyllt räknas scanningen inte mot månadskvoten. Annars – och vid alla fel – gäller
vanlig kvot (fail closed). Kvar som vanligt: rate-limit per användare (12 per 10 min), kill
switches för `food.scan`/OpenAI, samtycke, ett AI-anrop per scanning och användningsloggning.

Vanliga användares planer, kvoter och abonnemang ändras inte. Ingen migration behövs.

## Aktivering (kräver ditt godkännande)

Preview och Production delar Supabase-projekt, så steg 1 gäller båda.

1. **Admin-behörighet (en gång, i Supabase SQL Editor som databasägare).** BILL-4A-tabellerna finns
   redan i produktion med 0 administratörer. Kontrollera först användar-id:t:

   ```sql
   select id, email from auth.users where email = '<din e-post>';
   insert into billing.admin_permissions (user_id, permission, status)
   values ('<ditt user-id>', 'billing_admin', 'ACTIVE');
   select billing.has_billing_admin('<ditt user-id>');  -- ska ge true
   ```

   Obs: `billing_admin` ger också åtkomst till befintliga adminfunktioner i `/api/billing/admin`
   (kill switches, plan- och kostnadsinställningar).

2. **Vercel-miljövariabel**, per miljö: `FOOD_SCAN_OWNER_UNLIMITED=true` (först Preview), valfritt
   `FOOD_SCAN_OWNER_DAILY_CAP=<antal>`. Gör en ny deploy efteråt.

3. **Production** kräver dessutom att branchen mergas till `main`.

## Avaktivering

Ta bort flaggan i Vercel (verkar vid nästa deploy), eller återkalla behörigheten direkt:
`update billing.admin_permissions set status = 'REVOKED' where user_id = '<ditt user-id>';`
