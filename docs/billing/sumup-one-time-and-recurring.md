# Engångsköp 4 kr och vad återkommande betalning kräver

Engångsköpet och återkommande betalning är två skilda flöden. Det första köpet skapar ingen förnyelse och sparar inget kort.

## Engångsköp

Kunden väljer 4 kr-planen (`plan.prelim.sek.month.04`, köpnyckel `sek-400`). Servern sätter beloppet till 4 SEK från katalogen. Klienten kan inte skicka ett annat belopp. SumUp Hosted Checkout öppnas på `https://checkout.sumup.com`, och kunden kommer tillbaka till Viktkollen. Abonnemang och kvot aktiveras bara efter att servern själv har hämtat checkouten och sett status `PAID` med exakt en lyckad transaktion på 4 SEK. Samma aktivering används av webhook och återkomst. En öppen checkout återanvänds. Aktiveringen är idempotent per `paid:<checkout-id>`. Avbruten, misslyckad och väntande betalning ger ingen tillgång.

`purpose: SETUP_RECURRING_PAYMENT` avvisas i det här flödet.

## Återkommande betalning, inte en del av första köpet

SumUp har ingen prenumerationsresurs. En förnyelse kräver ett separat flöde som redan finns i `sumupRecurring.js` och som inte ska kopplas till engångsköpet:

1. En SumUp-kund skapas för användaren.
2. Ett setup-checkout med `purpose: SETUP_RECURRING_PAYMENT` tokeniserar ett betalningsinstrument. Det beloppet är inte betalningen för månaden.
3. Förnyelsen görs senare med det sparade instrumentet, serverns pris och en egen referens per period. Hosted Checkout används inte för förnyelsen.
4. Varje försök måste vara idempotent. En oklar timeout får inte bli en andra debitering.
5. Förnyelsearbetaren ska vara avstängd tills Live-identiteten är verifierad och staging-migreringarna är godkända för Production. Ingen extra riktig betalning ska göras för att prova förnyelse.
6. Periodregeln måste väljas medvetet. Engångsköpet ger exakt 30 dagar. Den befintliga förnyelsekoden räknar en kalendermånad.

Engångsköpet kan därför tas i bruk utan att återkommande debitering slås på.

## Migrationshistorik

Historiken ska inte skrivas om. `supabase db push` ska inte användas.

Git-filen `20261023150000_billing_one_time_checkout_no_renewal.sql` är ett tomt skal. Den ändrar inte `billing.activate_verified_checkout` och inga befintliga abonnemang. Production har samma innehåll registrerat som `20261028120403` med namnet `billing_one_time_checkout_no_renewal`. Versionen `20261023150000` finns inte i Production och ska inte läggas till.

Engångsbetalningens fyra SQL-filer är redan applicerade i Production: `20261026120000`, `20261026130000`, `20261028110000` och `20261028120000`. Ingen av dem ska köras igen, och ingen ny migration krävs före merge.

Staging har de tre första. `20261028120000` är inte applicerad där. Den skärper `billing.open_paid_plan_id` med periodstart, betalningsanstånd och admin-seed. Båda miljöerna har redan funktionerna för att öppna, aktivera och avsluta ett engångsköp, samt kolumnerna `provider_hosted_url` och `quota_window`. Funktionskroppen för betald kvot är därför stramare i Production än i Staging.

## Live förblir av

Följande är förberett och ska inte aktiveras förrän det godkänns. Production och Main ska inte ändras av den här texten.

1. `BILLING_SUMUP_LIVE_ENABLED` är en servervariabel. Bara det exakta värdet `true` slår på Live. Den är av som standard, och klienten kan inte skicka med den.
2. Av: både `SUPABASE_URL` och `VITE_SUPABASE_URL` ska peka på `https://armtslzspuebmlysnooq.supabase.co`. Handlaren måste ha `sandbox === true` och samma merchant code. Production-projektet `bxmdlckrlwzdtcxnsqqr` avvisas.
3. På: båda Supabase-adresserna ska peka på `https://bxmdlckrlwzdtcxnsqqr.supabase.co`. Handlaren måste ha `sandbox === false` och samma merchant code. Staging tillsammans med Live avvisas.
4. `BILLING_PUBLIC_BASE_URL` är https-ursprung utan sökväg, användare, fråga eller fragment. Av avvisas `viktkollen-app.vercel.app`, `viktkollen-app-appsonthego-s-projects.vercel.app` och `viktkollen-app-git-main-appsonthego-s-projects.vercel.app`. På godtages bara de adresserna, för webhook och återkomst. Svaret från handlaren loggas inte.
5. Försäljning av `plan.prelim.sek.month.04` styrs av den befintliga adminåtgärden `set_plan_availability`. Det ska inte skrivas som en migration. Live-flaggan ska förbli av tills en separat godkänd kontroll har visat att Production-nyckeln tillhör en handlare med `sandbox === false`.
