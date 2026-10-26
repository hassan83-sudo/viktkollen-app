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
