> Historical handoff. Implementation status is superseded by [EXTRA_SCAN_PURCHASES.md](EXTRA_SCAN_PURCHASES.md). Production sales are still disabled.

# Handoff till Claude — Viktkollen, 11 oktober 2026

## Syfte
Detta dokument sparar besluten och det påbörjade arbetet med extra scanningkvoter, så att Claude kan fortsätta utan att gissa. Det är INTE ett påstående att Claude har läst dokumentet.

## Var arbetet finns
- Repo: hassan83-sudo/viktkollen-app
- Gren: feature/extra-scan-purchases
- Draft PR: https://github.com/hassan83-sudo/viktkollen-app/pull/24
- Main och produktion ska inte ändras utan uttryckligt godkännande.
- Betalningar/köp är AVSTÄNGDA. Priserna är inte fastställda.

## Slutgiltiga produktbeslut
1. Abonnemangskvoter förnyas varje månad. Oanvända abonnemangskvoter försvinner vid förnyelsen; INGEN rollover.
2. Köpta extrakvoter gäller i 30 dagar från bekräftat köp, per separat köp. Oanvända köpta kvoter förfaller efter 30 dagar, oavsett abonnemangets förnyelsedag.
3. Abonnemangskvoter används först, därefter giltiga köpta extrakvoter.
4. Kunden kan köpa få extrakvoter av specifik typ (mat, kropp, AI-ögat), utan att byta abonnemang.
5. Prisplansbyte kan beställas när som helst, men träder i kraft vid NÄSTA abonnemangsförnyelse, både höjning och sänkning.
6. Visa exakt giltighetstid innan köp och i kvotvyn.
7. Priser inklusive moms, SumUp minsta debitering och avgifter ska kontrolleras när företaget och betalningsupplägget är klara. Aktivera inte checkout nu.

## Redan skapade filer på grenen
- src/services/billing/extraScanPurchases.js och .test.js: produkttyper, kvantitetsvalidering och avstängd köpflagga.
- src/services/billing/extraScanBalance.js och .test.js: preliminär JS-beräkning av köp/förbrukning och prioritetsval; ej auktoritativ databaslogik.
- supabase/migrations/20261011180000_extra_scan_ledger_preparation.sql: förberedda skyddade tabeller för grants och allocations; EJ applicerad på produktion.
- docs/billing/EXTRA_SCAN_PURCHASES.md: löpande krav och status.

## Viktiga begränsningar
- 30-dagarsutgången är dokumenterad men INTE implementerad i databasen.
- Migrationsfilen är en förberedelse, inte ett färdigt köpsystem. Schema saknar ännu expiry-kolumn och atomisk integrering med kvotreservationer.
- billing.reserve_quota, billing.commit_quota och billing.rollback_quota i supabase/migrations/20260921180000_billing_plan_quota.sql hanterar fortfarande bara ordinarie periodkvoter.
- Köpta kvoter är INTE anslutna till API, frontend, SumUp eller produktionsdatabas.
- Tester är skrivna men har INTE körts/verifierats i denna arbetsomgång.
- Säkra mot dubbla betalningsnotiser, samtidiga förbrukningar, felaktig återbetalning, utgångna kvoter och felaktig kvotåterställning.
- Befintlig abonnemangskvotlogik ska fortsätta fungera som tidigare.

## Nästa tekniska steg
1. Inspektera befintliga kvot-RPC:er och aktuella enheter för food.scan, body.scan, ai.eye.analysis.
2. Designa 30-dagarsgrants med verifierad betalningstid och utgångstid, samt idempotent payment_ref.
3. Bygg atomisk reservation, commit och rollback där månadsgränsen prioriteras och därefter endast ej utgångna köpta kvoter får användas. Hantera flera köpbatcher och samtidighet.
4. Lägg till testfall för utgångsdatum, månadsskifte, dubbla anrop, två samtidiga scanningar, avbruten scanning och abonnemangsbyte.
5. Kör tester i riktig testmiljö. Håll PR som draft och lämna main/produktion och betalningar orörda.

## Viktigt för Claude
Följ den SENASTE beslutslistan ovan; tidigare diskussion om obegränsad rollover för både abonnemang och köpta kvoter är uttryckligen återkallad. Rapportera vad som faktiskt kodats och testats, inte vad som bara planerats.
