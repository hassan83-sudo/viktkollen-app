# SumUp Hosted Checkout – Sprint 1: granskning och plan

Datum: 2026-10-26. Gren: `review/sumup-hosted-checkout-sprint1` (bas: `main` 5d8ea28).
Endast granskning. Ingen kod, inga hemligheter, ingen databasdata och inga betalningar har ändrats eller gjorts.
Production-databasen lästes med enbart läsfrågor (metadata och antal).

## 1. Vad som finns och vad som saknas

### Finns på `main`

| Del | Fil | Status |
|---|---|---|
| SumUp-adapter (skapa/hämta checkout, kunder, instrument, `PUT` för dragning) | `api/_shared/billing/providers/sumup.js` | Klar. Belopp/valuta/merchant kontrolleras mot serverns plan. Hosted-URL valideras strikt (`https://checkout.sumup.com/pay/<id>`). |
| Checkout-intent i databasen (skapa, binda SumUp-ref, avbryta, läsa) | `billing.create_checkout_intent`, `bind_provider_checkout_ref`, `cancel_checkout_intent`, `read_sumup_checkout_intent` | Klar och finns i Production. |
| Start av hosted checkout | `api/_shared/billing/checkoutIntent.js` → `POST /api/billing/checkout` | **Avstängd i praktiken**: rutten skickar aldrig med databasportarna, så varje riktig begäran stoppas med `DURABLE_UNAVAILABLE` (503) efter validering. |
| Webhook-ingång | `api/_shared/billing/providerWebhookIngress.js` → `POST /api/billing/webhook` | Notisen används bara som signal; checkouten hämtas alltid från SumUp innan något beviljas. |
| Aktivering efter **setup-checkout för recurring** | `sumupInitialActivation.js` + `billing.activate_verified_sumup_setup` | Klar och atomisk (abonnemang + instrument + plantilldelning + förbrukad intent i en transaktion). Se risk R1. |
| Aktivering efter **vanlig hosted checkout** | `billing.activate_verified_checkout` (finns i Production) | **Inte inkopplad**: webhooken går till `applyTrusted`, som bara sätts i tester. Svarar alltid `PROVIDER_NOT_CONFIGURED`. |
| Sandbox-flöde, 4 kr, Payment Widget | `sumupSandboxSetup.js`, `SumUpSandboxWidget.jsx`, `POST /api/billing/sumup-sandbox` | Klar. Kräver att SumUp svarar `sandbox: true` för merchant, annars `SANDBOX_IDENTITY_REQUIRED`. |
| Recurring-förnyelse | `api/_shared/billing/sumupRecurring.js` | Bara en lokal grund: tillstånd i minnet, ingen schemalagd körning, inte inkopplad i någon rutt. |

### Öppna PR:er

- **#83 Engångsbetalning, 30 dagar**:
  - Kopplar in databasportarna i `beginCheckout` och tillåter bara `payment_mode: one_time`.
  - Ger 30 dagars period och läser sälj-flaggor från servern.
  - Lägger till en köpknapp i `PlanComparison`.
  - Har en framåtmigration (`20261023150000`) som sätter `cancel_at_period_end = true`.
  - **Räcker inte för att en betalning ska aktiveras**, se blockerare B1–B3.
- **#59 Recurring-säkerhet**: hållbar förnyelse-worker med exklusiva databas-claims och återhämtningskö. Draft, inte på `main`.
- **#24 Extra skanningar**: eget hosted-flöde, draft, bygger på äldre bas.

### Production-databasen (bara läst)

- Migrationer t.o.m. `20260927180000` finns. **`20260927120000_billing_sumup_recurring_repair` är inte körd**: `mark_sumup_renewal_attempt_processing` saknas.
- `billing.checkout_intents` och `billing.subscriptions` är tomma: inga betalningar har gjorts.
- **`plan.prelim.sek.month.04` (4 kr) är till salu** (`plan_enabled_for_sale = true`). Övriga betalplaner är inte till salu.

## 2. Stöder Hosted Checkout vårt recurring-upplägg?

**Inte bekräftat. Utgå från nej tills SumUp svarar.**

- **Ingen dokumenterad recurring-väg för Hosted Checkout.** SumUps dokumentation beskriver Hosted Checkout som en färdig betalsida för enskilda betalningar (`hosted_checkout.enabled = true`, `hosted_checkout_url`, valfri `redirect_url`). Det finns ingen dokumenterad väg att spara kortet för recurring via den sidan.
- **Kortet sparas via Payment Widget.** Det dokumenterade sättet är en setup-checkout med `customer_id` och `purpose: SETUP_RECURRING_PAYMENT`, slutförd i **Payment Widget**. Där sker samtycke, mandat och 3D Secure. SumUps referens rekommenderar widgeten. Om man hoppar över den måste man själv skicka mandatdata och ta på sig PCI- och juridiska krav.
- **Setup-beloppet betalas tillbaka direkt.** Enligt SumUps guide gäller det vid lyckad verifiering. Setupen tokeniserar alltså bara kortet och är **inte** en betalning för första månaden.
- **Senare dragningar** görs som en vanlig checkout, som sedan behandlas med `PUT /v0.1/checkouts/{id}` och `{ payment_type: "card", token, customer_id }`. Den koden finns redan.
- **3D Secure:**
  - Vid setup sköter widgeten det. Vid Hosted Checkout sköter SumUps sida det.
  - Merchant-initierade dragningar kan enligt SumUp falla utanför SCA om de är kopplade till kundens samtycke och den autentiserade setupen.
  - Det är inte dokumenterat hur en senare dragning beter sig om banken ändå kräver autentisering (`next_step`). Koden måste då behandla dragningen som misslyckad eller oklar och aldrig som betald.
- **Ytterligare ett krav:** det är inte dokumenterat om recurring och tokenisering måste aktiveras för vårt merchant-konto.

**Slutsats:** Hosted Checkout passar för **engångsbetalning**. Recurring bör byggas på den befintliga Payment Widget-vägen plus #59, efter skriftligt besked från SumUp.

## 3. Filer och rutter som berörs

| Ändring | Fil/rutt |
|---|---|
| Databasportar + bara engångsläge | `api/_shared/billing/checkoutIntent.js` (`POST /api/billing/checkout`), från #83 |
| `return_url` (webhook) och `redirect_url` vid skapande; engångsverifiering utan krav på `customer_id` | `api/_shared/billing/providers/sumup.js` (`prepare`, `verify`) |
| Koppla in aktivering av vanlig hosted checkout via `billing.activate_verified_checkout` (samma mönster som setup-vägen) | `api/_shared/billing/providerWebhookIngress.js` (`POST /api/billing/webhook`) |
| Bekräftelse när användaren kommer tillbaka (servern hämtar checkouten, samma idempotenta aktivering) | ny operation i `api/billing/user/index.js`, t.ex. `POST /api/billing/checkout/confirm`, + rewrite i `vercel.json` |
| 30 dagar, ingen förnyelse | migration `20261023150000` från #83 |
| Köpknapp + återkomstsida | `src/components/billing/PlanComparison.jsx` (#83) + liten återkomstvy |
| Tester | `checkoutActivation.test.js`, `providers/sumup.test.js`, `paymentProviderFoundation.test.js`, nya webhook-/bekräftelsetester |

## 4. Minsta säkra implementation för Sprint 2

**Omfattning: engångsbetalning via Hosted Checkout, 30 dagar, ingen förnyelse. Bara sandbox och Preview.**

1. Utgå från #83, uppdaterad mot `main`.
2. `prepare()`:
   - Skicka `return_url` med serverns webhook-URL och `redirect_url` med appens återkomstsida (med `checkout_reference`).
   - Lägg inte till `purpose`.
3. `verify()` för engångsläget:
   - Kräv inte `customer_id`. Använd ett serverhärlett kundref (`vk<user-id>`).
   - Behåll alla övriga kontroller: intent, merchant, SEK, exakt belopp, `PAID`, exakt en `SUCCESSFUL`-transaktion.
4. Webhook:
   - Om checkouten inte är en setup, kör `activateVerifiedCheckout`. Den hämtar checkouten, verifierar den och anropar `billing.activate_verified_checkout` en gång.
   - Event-id `paid:<checkout-id>` ger idempotens.
5. Bekräftelse vid återkomst:
   - Användaren är inloggad. Intenten måste tillhöra användaren.
   - Samma funktion körs som i webhooken, så den som hinner först vinner och den andra blir en no-op.
   - Webhook och bekräftelse kör samma kod.
6. Skydd mot dubbelköp:
   - Återanvänd en öppen `pending` intent för samma användare och plan i stället för att skapa en ny.
   - Neka ny checkout om användaren har en aktiv betalperiod.
7. Klienten:
   - Visar bara "Väntar på bekräftelse" eller resultat från servern.
   - `redirect_url` beviljar aldrig något.
8. Grindar:
   - Rutten svarar `PROVIDER_NOT_CONFIGURED` om SumUp-nycklar saknas.
   - Inga nya nycklar i klienten.
   - Testerna körs mot en sandbox-merchant (kontrollerad via `retrieveMerchant().sandbox === true`).
   - Preview mot Staging-databasen.
   - Sandbox-belopp 11 kr används för att prova felvägen.

Recurring flyttas till Sprint 3–4: Payment Widget-setup, första betalningen, #59 och SumUps besked.

## 5. Risker

**R1. Gratis månad med recurring (hög).**
- `activate_verified_sumup_setup` ger en betald period direkt när setup-checkouten är `PAID`.
- SumUp betalar tillbaka setup-beloppet. Användaren får alltså en betald månad utan att ha betalat.
- Åtgärd: setupen får bara binda kortet. Första perioden aktiveras efter en separat, verifierad dragning, eller efter en vanlig hosted engångsbetalning.

**R2. Betalt men inte aktiverat (hög).**
- Idag skickas ingen `return_url` (webhook) och ingen `redirect_url`, och hosted-aktiveringen är inte inkopplad.
- Med #83 som den är kan en kund alltså betala utan att få tillgång.
- Åtgärd: punkt 2–5 ovan. Dessutom en larmlista över `PAID` checkouts utan aktivering.

**R3. Dubbeldebitering vid engångsköp (medel).**
- Två flikar eller två tryck kan skapa två intents och två betalningar.
- Den andra aktiveringen nekas (`duplicate_open_subscription`), men pengarna är dragna.
- Åtgärd: återanvänd en öppen intent, och neka checkout vid aktiv period. En nekad aktivering med `PAID` måste hamna i manuell granskning eller återbetalning. Automatisk återbetalning ska inte byggas i Sprint 2.

**R4. Dubbeldebitering vid förnyelse (hög om recurring aktiveras).**
- `sumupRecurring.js` på `main` håller försöken i minnet.
- Reparationsmigrationen saknas i Production, och #59 (hållbara claims) är inte mergad.
- Recurring får inte aktiveras förrän #59 är granskad och migrationerna finns.

**R5. Felaktiga kvoter (medel).**
- Engångsköpet ger 30 dagar (#83), men kvotperioder och förnyelselogik utgår från kalendermånad (`sumUpMonthPeriod`).
- Det måste verifieras att kvoten följer abonnemangets `current_period_*` och nollställs rätt när perioden slutar utan förnyelse.

**R6. 4 kr-planen är till salu i Production (medel).**
- Den är en sandboxplan, men så fort checkout aktiveras kan den köpas på riktigt.
- Rekommendation: stäng försäljningen innan Sprint 2 når Production. Det är en dataändring och kräver ditt godkännande.

**R7. Obekräftade betalningar (medel).**
- `PENDING` eller okänd status beviljar aldrig något, och det är rätt.
- Men det finns ingen avstämning efteråt. En webhook som aldrig kommer gör att betalningen blir hängande tills användaren bekräftar vid återkomsten.
- Åtgärd: bekräftelsen vid återkomst, plus avstämning i Sprint 3.

**R8. Webhookens äkthet (låg).**
- Notiser verifieras inte med signatur, men de används bara som signal och checkouten hämtas alltid med vår API-nyckel.
- Det är tillräckligt. Om webhooks i stället registreras i SumUps dashboard ska `x-payload-signature` (HMAC-SHA256) verifieras.

## 6. Pågående SumUp Live-identitetsverifiering

- **Inget i Sprint 1 rör SumUp.** Inga API-anrop, inga nycklar, inga kunder och inga checkouts har skapats.
- **Ingen kod på `main` anropar SumUp av sig själv.** Det finns ingen cron och inga bakgrundsjobb. SumUp nås bara när en användare startar checkout (stoppas idag), via sandbox-rutten eller via en webhook-notis.
- **Sandbox-rutten mot ett live-konto** gör högst en läsning av merchant (`GET /v1/merchants/{code}`) och stoppar sedan med `SANDBOX_IDENTITY_REQUIRED`.
- **Regler för Sprint 2:**
  - Inga live-nycklar på Preview.
  - Ingen ändring av merchant-uppgifter.
  - Inga live-checkouts eller live-kunder.
  - Sandbox-grinden (`sandbox === true`) behålls.
  - Production-flaggan för försäljning ändras inte förrän identitetsverifieringen är klar och du har godkänt.

## 7. Blockerare innan Sprint 2

1. **Besked från SumUp:**
   - Kan Hosted Checkout användas för `SETUP_RECURRING_PAYMENT`?
   - Är recurring och tokenisering aktiverat för vårt konto?
   - Vad gäller för SCA vid merchant-initierade dragningar?
   - Behövs bara för recurring, inte för engångsköp.
2. **Sandbox-nycklar och sandbox-merchant på en Preview-gren**, med Staging-databas. Utan dem kan Sprint 2 bara testas med simulerat SumUp. Inga nycklar ska läggas till utan ditt godkännande.
3. **Beslut om 4 kr-planen** ska tas bort från försäljning i Production (dataändring).
4. **Beslut om #83 ska vara bas för Sprint 2.** Rekommenderas, med tilläggen i avsnitt 4.
5. **Nätverk:** den här miljön når inte `developer.sumup.com`, `api.sumup.com` eller `gateway.sumup.com`. Riktiga sandbox-tester måste köras på Preview eller med öppnat nätverk.

## Källor

- [SumUp: Hosted Checkout](https://developer.sumup.com/online-payments/checkouts/hosted-checkout/)
- [SumUp: Hosted Checkout (verktygssida)](https://developer.sumup.com/online-payments/tools/hosted-checkout)
- [SumUp: Hosted Checkout changelog](https://developer.sumup.com/changelog/hosted-checkout/)
- [SumUp: Save Customer Cards](https://developer.sumup.com/online-payments/guides/tokenization-with-payment-sdk)
- [SumUp: 3D Secure](https://developer.sumup.com/online-payments/3ds)
- [SumUp: Payment Widget](https://developer.sumup.com/online-payments/checkouts/card-widget)
- [sumup/sumup-skills: checkout-playbook](https://github.com/sumup/sumup-skills/blob/main/skills/sumup/references/checkout-playbook.md)
- [sumup/sumup-skills: recurring-tokenization](https://github.com/sumup/sumup-skills/blob/main/skills/sumup/references/recurring-tokenization/README.md)
