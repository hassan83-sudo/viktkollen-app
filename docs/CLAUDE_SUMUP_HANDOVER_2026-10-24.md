# Överlämning till Claude – SumUp PR #59

Status vid överlämning 2026-10-24. Inga nya fjärrkontroller eller tester gjordes
för denna sammanställning. Stoppa betalningar och schemaläggning fortsatt.

## Arbetskopia

- Sökväg: `C:\Users\hassa\OneDrive\Documents\ChatGPT\viktkollen-body-subtitle-push\review-app`
- Repo: `hassan83-sudo/viktkollen-app`, PR #59.
- Gren: `fix/sumup-recurring-production-wiring`.
- HEAD före denna överlämningscommit: `cfc2c7490c7ee5cc98c776302e883bb01e785db6`.
- Föregående implementeringscommit: `2ccb77fb96df1aa149472ab5a6c1f77a7bd5bcbc`.
- Senast hämtade fjärr-HEAD: `11f203ec1ea5b558ad8ba517174c4dd05822c0d7`.
  De två ovanstående lokala commitsen är inte pushade. Överlämningsfilen får
  ytterligare en lokal commit; `git log -1` visar dess SHA.
- Inga tracked ändringar var ocommittade före denna fil.
- Befintliga untracked objekt: `.tmp/` och
  `docs/PREVIEW_SECURITY_RESPONSE_2026-10-20.md`. De lämnades orörda och ingår
  inte i commitsen. Undersök inte eller publicera deras innehåll slentrianmässigt.
- Ingen känd pågående verktygskörning finns vid överlämningen.

## Faktiskt installerat i Supabase Staging

Endast projekt `armtslzspuebmlysnooq`. Production är
`bxmdlckrlwzdtcxnsqqr` och får inte användas i detta arbete.

| Version | Migration | Förlopp |
| --- | --- | --- |
| 20261024065246 | sumup_renewal_facts_draft | Fanns före denna sprint |
| 20261024065249 | sumup_renewal_snapshot_guard_draft | Fanns före denna sprint |
| 20261024065251 | sumup_renewal_checkout_uniqueness_draft | Fanns före denna sprint |
| 20261024065319 | sumup_renewal_claim_draft | Fanns före denna sprint |
| 20261024065322 | sumup_renewal_commit_draft | Fanns före denna sprint |
| 20261024065325 | sumup_renewal_facts_reader_draft | Fanns före denna sprint |
| 20261024082814 | sumup_renewal_worker_draft | Installerades före avbrottet |
| 20261024082822 | sumup_renewal_failure_draft | Installerades före avbrottet |
| 20261024082853 | sumup_renewal_bind_checkout_draft | Installerades före avbrottet |
| 20261024083012 | sumup_renewal_recovery_draft | Installerades före avbrottet |
| 20261024083536 | sumup_renewal_pending_plan_draft | Saknades efter avbrottet; installerad i explicit transaktion |
| 20261024083855 | sumup_renewal_staging_worker_role | Ny begränsad roll, installerad i transaktion |

Kör inte om dessa migrationer. Lokala filnamn, testreferenser och CI har
synkroniserats till dessa versioner. Tidigare sex versioner behölls. Inga
migrationshistorikposter skrevs om. De fem omdöpta migrationsfilerna har samma
innehåll som tidigare. Recovery installerades före planbytesreparationen;
hela den verkliga kronologiska ordningen har därefter testats lokalt.

Den först avbrutna planbytesmigrationen gjorde inga bestående ändringar.
Dess DROP gäller endast skyddstriggern, som återskapas i samma transaktion;
inga tabeller eller kunddata raderas. Första rollförsöket rullades tillbaka då
en kontroll även nekade PostgreSQL:s automatiska medlemskap för rollskaparen.
Kontrollen rättades före det lyckade försöket; ingen extra rättighet kvarstod
från det misslyckade försöket.

## Sprint 1 – verifierat och återstående

Verifierat mot verklig Staging, utan SumUp-anrop:

- `expected_plan_id` och `expected_plan_version` finns.
- `sumup_renewal_snapshot_guard` är aktiv BEFORE INSERT OR UPDATE och använder
  `billing.prevent_sumup_renewal_snapshot_rewrite()`.
- Felaktig bunden snapshot nekades med `sumup_renewal_plan_price_mismatch`.
- Work/recovery med limit 0 och facts för obefintligt abonnemang kördes som
  administrativ SQL-kontroll. Provtransaktionen återställdes.
- RPC-/livscykelberoenden och fasta search_path verifierades.
- Rollens effektiva rättigheter och anon/authenticated-avslag verifierades
  via katalog/rättighetsfunktioner.
- Alla 65 befintliga abonnemang hade oförändrad aggregerad kontrollsumma.
  Förnyelseförsök och kvarvarande provrader: 0.
- 14 berörda worker/recovery-integrationstester och 3 nya roll-/ordningstester
  passerade lokalt: 17 unika tester. Riktad ESLint och diffkontroll passerade.
  PGlite och simulerad provider är inte verklig Sandbox-verifiering.
- Säkerhetsadvisorn gav inga billing-fynd; övriga fynd dokumenteras i
  `docs/sumup-recurring-launch-gates.md`. Inga sådana inställningar ändrades.

Återstår: konfigurera säker rollinloggning, separat TLS-anslutningssträng och
verifiera en verklig autentiserad anslutning med den begränsade rollen. MCP:s
SET ROLE nekades; påstå inte att rollinloggningen redan har fungerat.

### Arbetarroll

`sumup_renewal_staging_worker` är fortsatt **NOLOGIN**, utan lösenord.
NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS.
Connection limit 2; statement_timeout 15s; lock_timeout 5s; search_path pg_catalog.
Schema USAGE på billing; ingen schema CREATE eller direkt billing-tabellåtkomst.
Ingen medlemskap i andra roller. Skapande administratör `postgres` har
automatiskt medlemskap i arbetarollen; inga appidentiteter lades till.

Exakt åtta billing-RPC:er med EXECUTE:

1. `read_sumup_renewal_facts_draft(text,timestamptz)`
2. `list_sumup_renewal_work_draft(integer)`
3. `claim_sumup_renewal_attempt(text,text,timestamptz)`
4. `bind_sumup_renewal_checkout_draft(text,text,text,timestamptz,timestamptz)`
5. `commit_verified_sumup_renewal(text,text,timestamptz,text,timestamptz)`
6. `record_verified_sumup_renewal_failure_draft(text,text,timestamptz,text)`
7. `list_sumup_renewal_recovery_draft(integer)`
8. `record_sumup_renewal_observation_draft(text,text,text,text,boolean)`

## Vercel och anslutningsblockerare

Projekt: `viktkollen-app`, ID `prj_rJHYBvR9AIJ6bkHTrfbBZ7SisZMd`,
team `appsonthego-s-projects`, ID `team_Ijx0WNR4TvxPNb1tSJfwcwH3`.

**Inga nya Vercel-variabler skapades för SumUp-förnyelserna.** Den avvisade/
misslyckade begäran att skapa `SUMUP_RENEWAL_STAGING_PROJECT_REF` för Preview
på exakt denna gren är **ej genomförd**. Efterföljande läsning gav inga
`SUMUP_RENEWAL_*`-poster. Begäran för `SUMUP_RENEWAL_STAGING_ENABLED=false`
skickades aldrig eftersom första begäran misslyckades. Ingen befintlig post
ändrades. Avsaknad av ENABLED gör att arbetaren förblir avstängd.

Befintliga poster, enbart Preview på `fix/sumup-recurring-production-wiring`:
`SUPABASE_SERVICE_ROLE_KEY` (Secret), `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUMUP_MERCHANT_CODE`,
`SUMUP_API_KEY` (Secret). Dessa har inte ändrats av förnyelsesprinten.
Ingen ny fullständig miljöisolering har verifierats i denna fortsättning.

`SUMUP_API_KEY` är oläsbar genom Vercels API och kan inte kopieras till
`SUMUP_RENEWAL_STAGING_API_KEY`. Merchant-inställningen går att läsa men dess
Sandbox-identitet är inte nyverifierad; verifiera `sandbox:true` hos SumUp
innan någon betalning. Inga provideranrop har gjorts.

Inga lokala Supabase/SumUp/databasvariabler eller lokala test-env-filer fanns.
Ingen Management-token hittades i kända Supabase CLI-filpositioner. MCP:s
OAuth/SQL-session är inte en återanvändbar lokal PostgreSQL-anslutning.
Undvik att överföra nya lösenord via MCP-SQL-argument eller verktygsresultat.

Saknade separata inställningar:
- `SUMUP_RENEWAL_STAGING_DATABASE_URL`: TLS, endast denna begränsade roll och
  Staging. Ingen postgres-/service_role-ersättning.
- `SUMUP_RENEWAL_STAGING_API_KEY`: verifierad Sandbox-hemlighet.
- `SUMUP_RENEWAL_STAGING_MERCHANT_CODE`: verifierad Sandbox-merchant.
- `SUMUP_RENEWAL_STAGING_PROJECT_REF`: rätt Staging-ref, ännu ej skapad.
- ENABLED måste hållas unset/false; aktivera inte i Sprint 1.

## Sprint 2 och 3

- Sprint 2: verklig Sandbox-förnyelse och idempotent upprepning är INTE körda.
  Bevara befintliga testabonnemang. Den nuvarande manuella köraren väljer en
  kö av förfallna abonnemang: säkerställ explicit testisolering/urval innan
  den någonsin aktiveras. Kör inte hela delade Staging-kön oavsiktligt.
- Tidigare godkänd CI vid `11f203e`: 149 förnyelsetester, 13 betalningsprov
  med simulerad SumUp, fem förnyelsejobb. Kör inte om utan ändringsorsak.
- Sprint 3: skyddad schemaläggning och manuell handler-verifiering i Staging
  återstår. Vercel Cron är Production-only; aktivera ingen cron/deployment.
- Inga nya fjärr-CI-resultat finns för de opushade lokala commitsen.

## Exakt nästa steg

Läs denna fil och `docs/sumup-recurring-launch-gates.md`, fortsätt i samma
arbetskopia/gren. Kontrollera först om användaren nu har lämnat en **lokal
DPAPI-krypterad filsökväg** till en kortlivad Supabase Management-token med
Database Write, scoped endast till `armtslzspuebmlysnooq` (inte Legacy/PAT
med full kontobehörighet). Säker dold inmatning finns i launch-gates-dokumentet;
standardplatsen är `%LOCALAPPDATA%\Viktkollen\sumup-staging-management.dpapi`.
Filen har inte skapats av Codex och token har inte mottagits.

Om token saknas: be endast om detta säkra överlämningssteg, aldrig om token
i chatten. Om tillgänglig: konfigurera rollens inloggning och generera dess
starka lösenord i en lokal process utan utskrift/loggning, lagra separat
anslutningssträng säkert och verifiera TLS + current_user + avsedda RPC-rättigheter
utan att importera/köra betalningsarbetaren. Bevara de åtta rättigheterna.
Rensa handover-filen och låt den tillfälliga token återkallas efteråt.

Ingen ny migration behövs för installerade objekt. Inga betalningar, pushar,
deployments, scheman, main- eller Production-ändringar är tillåtna i detta steg.
Ingen merge eller Production-aktivering utan användarens uttryckliga beslut.
