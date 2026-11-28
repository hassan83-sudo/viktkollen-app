# Leverans och verifiering av #210

Datum: 2026-11-28. PR: https://github.com/hassan83-sudo/viktkollen-app/pull/211.

## Beteende

- Gratis behåller fem skanningar per kalendermånad. Mat och AI Natur använder redan samma `food.scan`-reservationer.
- Knappen **Starta 30 dagar gratis** gör en autentiserad POST. GET startar aldrig provperioden. Identitet hämtas från verifierad session; klientens plan, kvot, pris och datum ignoreras.
- `billing.start_account_trial` kräver ett befintligt e-post/lösenordskonto och skapar `TRIALING` via befintlig abonnemangsfunktion. En separat, skyddad kontohistorik hindrar en andra provperiod. En aktiv betalperiod eller pågående betalning skrivs aldrig över.
- Provperiodens separata plansnapshot har fem gemensamma mat-/naturskanningar och `quota_window = subscription`. Den lagrade perioden är exakt 720 timmar. Den befintliga atomiska kvotmotorn används; en gemensam transaktionsspärr gör att väntande skanningar läser planen efter aktivering.
- Inga betalningsinstrument, checkoutförfrågningar eller debiteringar skapas för en provperiod. Användaren kan inte ta bort slutdatumet via abonnemangets ändrings-API. Ägarundantaget får inte kringgå provkvoten.
- Servern nekar abonnemangsbehörighet vid slutdatumet. Appens spärrar använder serverns beslut, låser vid slutdatum och gör ny kontroll vid kontobyte. Garderobens molndata skyddas även med RLS. Sparade data och historik raderas inte. Befintlig checkout kan avsluta en utgången provperiod inför ett senare betalköp.
- Prislistan och nyköps-API accepterar endast gratis respektive 12-kronorsplanen. Historiska betalda planrader, kvoter och reservationshistorik finns kvar. Inget separat kreditlager eller aktivt separat skanningsköps-API hittades i main/produktion. Den gamla kvotfunktionens kropp bevaras exakt, så att befintlig bokföring inte ersätts eller nollställs.
- Befintliga SumUp-checkout-, aktiverings- och förnyelsefunktioner samt cron är oförändrade. Publika köp fortsätter genom befintligt betalningsflöde.

## Tester

| Kontroll | Resultat |
| --- | --- |
| Nya databas-, API-, knapp- och åtkomsttester | 32 godkända |
| Billing/API/UI-regression inklusive nya 3D-garderobstester från main | 862 godkända, 4 befintliga fel |
| Bredare kontroll av berörda kameravyer och matplanering | 952 godkända, 41 befintliga fel; samma 37 UI-fel återfanns i orörd main utöver de 4 billingfelen |
| Accessibility Vitest | 582 godkända, 3 befintliga fel; exakt samma tre reproducerades i orörd main |
| `npm run build` efter integrering av senaste main | Godkänd |
| `git diff --check` | Godkänd |
| ESLint på ändrade JS/JSX-filer | Inga nya fel; tre befintliga fel i MealLogger/OverviewDashboard verifierades på orörd main |
| GitHub SumUp one-time checkout | Godkänd |
| GitHub SumUp Live diagnostic checks | Godkänd |
| GitHub Security Center checks | Godkänd |
| Vercel preview | READY |

Nya tester omfattar start, engångsregel, nekad klientauktoritet, obehöriga anrop, fem gemensamma reservationer, månadsskifte, återställning efter misslyckad skanning, exakt utgång, bevarade sparade data, kontobyte, RLS, befintlig betalkvot och oförändrad betald abonnemangsrad.

De fyra befintliga billingfelen gäller AI Naturs registrering i äldre statiska allowlist-tester (`featureCostGate`, `billing4b.security`, `billingMigration.security`, `costThreshold.sec1a`). Accessibility-felen gäller befintliga confirm-/namnkontroller på startsidan. Dessa ändras inte i denna uppgift. Det befintliga `supabase:security-check` stoppar också på den äldre migrationen `20261007133000_nutrition_food_bank_foundation.sql`.

## Databas och skyddad förnyelse

Migrationen `20261128092522_account_free_trial.sql` har applicerats och verifierats i billing-staging och produktion. Historikens version är synkroniserad med filnamnet i båda miljöerna.

Staging verifierades med de verkliga databasfunktionerna i en transaktion: start, fem reservationer/commits, nekad sjätte skanning, nekad andra provperiod och RPC-grants. Samtliga testkonton och testdata rullades tillbaka. Ingen provperiod aktiverades i produktion.

Följande kontrollsummor jämfördes före och efter produktionsmigrationen och var identiska:

| Skyddat objekt | Kontrollsumma före och efter |
| --- | --- |
| Befintligt aktivt 12-kronorsabonnemang | `ff5d274b9e1d6f4191f82336d96d0d23` |
| Dess betalningsinstrument | `1447996829629bde8bba2c673e6e8339` |
| Dess förnyelseposter | `d751713988987e9331980363e24189ce` |
| 12-kronorsplanens samtliga kvoter/behörigheter | `65529cef3bf4b8793a937f55efba37b4` |
| Befintlig reservationsfunktions kropp | `0c656e448b82c8fc1ca7cfb4698420b0` |
| SumUp-/checkoutfunktionernas kroppar | `7d894461cfaa1f699a4877bf49e30c8b` |

Det skyddade abonnemangets lagrade periodslut är 2 december kl. 13.31 svensk tid. Den befintliga dagliga förnyelsekörningen efter detta infaller den 3 december. Inga datum, instrument, förnyelser eller prenumerationsrader ändrades av migrationen.

Supabase security advisors visade inga nya fynd efter migrationen. Befintliga fynd för andra scheman lämnades orörda: https://supabase.com/docs/guides/database/database-linter.

## Ändrade filer

Utöver denna rapport ändrades följande filer:

- `api/_shared/billing/accountTrial.js`
- `api/_shared/billing/accountTrial.test.js`
- `api/_shared/billing/bodyScanOwnerExemption.test.js`
- `api/_shared/billing/checkoutActivation.test.js`
- `api/_shared/billing/checkoutIntent.js`
- `api/_shared/billing/foodScanOwnerExemption.js`
- `api/_shared/billing/foodScanOwnerExemption.test.js`
- `api/_shared/billing/paymentProviderFoundation.test.js`
- `api/_shared/billing/providers/sumup.test.js`
- `api/_shared/billing/subscriptionRead.js`
- `api/_shared/billing/sumupOneTimeCheckout.test.js`
- `api/_shared/billing/usageSnapshotRead.js`
- `api/_shared/billing/userLifecycleIntent.js`
- `api/_shared/featureAccess.js`
- `api/_shared/featureAccess.test.js`
- `api/billing/user/index.js`
- `api/billing/user/plans.test.js`
- `api/billing/user/usage.test.js`
- `api/nutrition-photo-analysis/index.test.js`
- `src/components/MealLogger.jsx`
- `src/components/NoticeKitchenTimers.jsx`
- `src/components/app/OverviewDashboard.jsx`
- `src/components/billing/PlanComparison.jsx`
- `src/components/billing/PlanComparison.test.jsx`
- `src/components/billing/SubscriptionGate.jsx`
- `src/components/billing/TrialOffer.jsx`
- `src/components/billing/TrialOffer.test.jsx`
- `src/features/smart-camera/components/SmartCameraStage.jsx`
- `src/services/billing/accountTrial.database.test.js`
- `src/services/billing/forgottenAccess.js`
- `src/services/billing/planCatalog.js`
- `src/services/billing/planComparison.js`
- `src/services/billing/planComparison.test.js`
- `src/services/billing/usageSnapshot.js`
- `src/services/featureAccess/featureAccessClient.js`
- `src/services/featureAccess/useFeatureAccess.js`
- `src/services/featureAccess/useFeatureAccess.test.jsx`
- `supabase/migrations/20261128092522_account_free_trial.sql`
- `vercel.json`
