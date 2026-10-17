# AI-kundtjänst inför 31 oktober 2026

Arbetsgren: `codex/ai-support-review`, fortsättning från `7dbe726`. Denna rapport ersätter nulägesbeskrivningen i `AI_SUPPORT_REVIEW_2026-10-17.md`.

## Navigering och verifierad funktion

| Funktion | Exakt väg | Vad som fungerar |
| --- | --- | --- |
| AI-Hjälp | Nedre navigeringen → Mer → Inställningar → AI-Hjälp → Öppna AI-Hjälp | Appfrågor, åtta meddelandens historik, kunskapsbas och tillåtna navigeringsverktyg. Alla inloggade kan använda hjälpen; modellbudget gäller även här. |
| AI-kundtjänst | Samma panel: fråga om ditt abonnemang, din kvot eller betalningsstatus | Servern läser endast den autentiserades verifierade kundfakta. Gratisplan och betalda planer skiljs från okänd/otillgänglig data. Ingen betalningsorsak hittas på. |
| Avancerad AI-kundtjänst | Samma panel: be om en annan förklaring eller ställ en följdfråga | Referenser till tidigare personliga frågor återanvänder kontext men läser kundfakta på nytt. Tidigare assistenttext används inte som identitet. Modellbaserad förklaring får relevanta verifierade fakta. Kräver befintlig modellnyckel och delad kostnadsbudget. |
| Mänsklig support | Samma panel → Mänsklig support → Kontrollera supportåtkomst → välj kategori → skriv problem → Skicka supportärende | Endast verifierade betalande kunder får skicka nya ärenden och följdsvar. Tidigare egna ärenden kan läsas även efter nedgradering. Svaret visas i samma ärendetråd. Ingen automatisk överföring av AI-chatten. |
| Administratörskö | Mer → Inställningar → Supportärenden, under befintlig AI Bug Monitor-ingång | Visas bara när serverns befintliga `billing_admin`-kontroll godkänner användaren. Läs kö, välj prioritet/status, spara och svara. API och databas kontrollerar behörigheten igen vid varje anrop. |
| Adminnotifiering | Samma Supportärenden-vy → Nya supportförfrågningar; valfritt Aktivera webbläsarnotiser | Nytt kundärende/följdsvar markerar notifiering i samma databastransaktion. Kön läses var 30:e sekund när vyn är monterad. Webbläsarnotis använder befintlig notifikationsvisning och innehåller ingen kundtext. Räknaren fungerar utan webbläsartillstånd. |
| Direkt till matscanner | I AI-Hjälp: ”Ta mig till matscanningen”, ”Take me to the food scanner”, ”Llévame al escáner de alimentos”, ”خذني إلى ماسح الطعام” | Öppnar Mer → Mat → Matscanning via befintlig `nutritionIntent.panel = scanner`. AI-Hjälp startar ingen analys och begär inte kameran själv; matscannern startar sin livekamera automatiskt när vyn syns, precis som vid vanlig navigering. Featureflödets egna samtyckes-, behörighets- och betalningskontroller finns kvar. |
| Uppsägning | I AI-Hjälp: begär uttryckligen uppsägning av abonnemanget → läs erbjudandet → Bekräfta uppsägning | Kräver aktuell autentisering och samma konto som fick erbjudandet. Chatttext, modelltext och historik utför ingen uppsägning. Testat med mockad billing; inget riktigt abonnemang ändrades. |
| Teknisk felrapport | AI-Hjälp → Rapportera tekniskt fel | Befintlig bugMonitor, separat från mänsklig support; chatttexten skickas inte med. |

## Betald support: regler och återanvändning

- Återanvänder Supabase/PostgreSQL, befintlig tokenverifiering, `billing.has_billing_admin`, AI-dispatchern, Inställningar och befintlig webbläsarnotifikationsvisning.
- `/api/support` skrivs om till `/api/ai?__vk_route=support`. Ingen ny serverless-funktion eller extern supportleverantör.
- En tabell, `support.tickets`, med kundägare, tråd, kategori, prioritet, status, notifieringsflagga och versionsnummer. Fullständiga kund-/betalningsuppgifter eller chattloggar kopieras inte automatiskt.
- Nytt supportärende kräver en plan med positivt verifierat databaspris och en aktuell ACTIVE-period, alternativt PAST_DUE med giltig respit. Gratis, provperiod, pausad, utgången och okänd plan ger inte ny mänsklig support. Kunden kan inte själv hävda premiumstatus.
- Betalningsärenden får hög prioritet, övriga normal. Admin kan ändra prioritet och markera öppet/pågående/besvarat/löst. Kön visar högsta prioritet först och äldst inom prioriteten; lösta ärenden sist. Upp till 200 ärenden visas i adminvyn och 50 av kundens senaste ärenden i kundvyn.
- Högst tre samtidigt öppna/pågående ärenden och tio nya ärenden per dygn/kund. Svar begränsas i längd, takt och trådlängd. UUID för skapandebegäran gör återförsök idempotenta.
- Versionskontroll stoppar överskrivning från gamla admin-/kundvyer. Kunden kan varken läsa eller svara i någon annans ärende, även om båda betalar.
- RLS är aktiverat. `anon` och `authenticated` saknar schema-, tabell- och RPC-rättigheter. Endast serverns service_role får köra de fasta kommandona. Alla funktioner använder `SECURITY INVOKER` och tom search_path. Admin-RPC kontrollerar databasens adminroll igen.
- Supporttabellen har främmande nyckel till `auth.users` med radering genom cascade. Supportkoden ändrar inga konton, abonnemang, planer eller adminroller.

## Språk och säkra svar

Svenska, engelska, arabiska och spanska har översatta AI-/supportkontroller. Arabiska ger RTL, och aktiv språkkod skickas vid varje ny AI-fråga. Kontroller byter språk i samma öppna panel; tidigare meddelanden behåller sitt ursprungsspråk.

Personliga kundsvar är deterministiska på dessa fyra språk: plan, pris, abonnemang, periodslut, kvot, betalningsstatus, åtkomst och uppsägningsbekräftelse. Avancerade formuleringar använder modellen med samma språkkod. Om en icke-svensk modellförklaring begränsas visas ett översatt fel-/begränsningsmeddelande i stället för svensk katalogtext. Generell översättning av hela kunskapskatalogen utan modell är inte införd.

Tidigare skydd är kvar: ingen privat sessionStorage-tråd, panelen återställs vid kontobyte, sena svar kastas efter kontobyte, gamla uppsägningsknappar återställs inte och en ny fråga tar bort gamla erbjudanden. Negationer som ”jag vill inte avsluta mitt abonnemang” skapar inte uppsägningserbjudanden. Falska påståenden om utförda kontoåtgärder filtreras även på engelska, spanska och arabiska.

## Verifiering

- Fokuserade tester: **23 testfiler och 187 tester godkända**. Täcker tidigare säkerhetsskydd, kundkontext, betald/gratis åtkomst, kvoter, språk, direktnavigering, adminbehörighet, API-dispatch, ägarskap, notisflagga, idempotens, versionskonflikter och kontoradering/billing med testdubblar. Körlogg: `ai-support-focused-tests.log`.
- Databasmigrationen körs som riktig PostgreSQL/PLpgSQL i PGlite. Testerna använder bara lokala syntetiska användare och abonnemang. Testberoendet PGlite är pinnat till 0.5.10 och ingår inte i appens runtime.
- Webbläsare: **6/6 godkända** i 390 × 844 mobilvy. Testar appens riktiga komponenter/navigering med simulerade API-svar och aldrig kontakt med riktiga konton: gratisnivå, betalt kundärende → adminnotis → prioritering/status → adminsvar → kundtråd, exakt scanner-vy utan att AI-Hjälp själv begär kameran (scannerns egen automatiska kamerastart är oförändrad) samt sv/en/ar/es i samma panel. Dessutom verklig lokal AI-handler med avvisat testtoken och kontroll av nyckelexponering.
- Lint för ändrade kodområden och build är godkända. Build har befintlig varning för stora chunks. Global lint har fortfarande **50 fel och 9 varningar** utanför de ändrade områdena.
- Hela testsviten: **5089 godkända, 68 misslyckade**. Jämförelse mot fristående ursprungskod visar **inga nya misslyckade tester**. [Exakta testnamn, befintliga fel och skillnader](AI_SUPPORT_TEST_COMPARISON.md). Den ursprungliga ”70”-listan varierar med ett befintligt SumUp-miljötest; dess försvunna fel ska inte räknas som en utförd reparation. Två föråldrade krav på exakt 11 API-funktioner har ersatts med projektets befintliga högst-12-budget samt kontroll av att support inte blir en ny funktion.

## Aktivering inför lanseringen – inte utförd mot någon fjärrmiljö

1. Granska PR och migration `20261017091445_paid_customer_support.sql`. Main, Production, riktiga abonnemang och riktiga användarkonton har lämnats orörda.
2. Applicera migrationen först i en uttryckligen avsedd stagingdatabas. Gör schema `support` åtkomligt för serverns PostgREST-anrop genom den miljöns Exposed schemas-inställning. Ge inte browserroller ytterligare schema-/tabell-/funktionsgrants; migrationen spärrar dem. Kontrollera att service_role kan anropa support-RPC och att anon/authenticated nekas.
3. Verifiera Supabase-konfiguration och befintlig adminroll i staging; ingen automatisk admin-bootstrap ingår. Testa med särskilda syntetiska gratis-/betalkunder. Inga riktiga betalningar behövs.
4. För avancerade modellförklaringar: verifiera befintlig `OPENAI_API_KEY`, AI_HELP-budget och delad kostnadslagring i staging. Ingen nyckel eller verklig modellbudget har använts i detta arbete.
5. Kör de dokumenterade kund/admin-flödena mot staging och granska databasens säkerhetsråd före release. Docker-daemon saknades lokalt; därför användes PGlite för körbara SQL-säkerhetstester. Supabase-hostad auth, Data API-konfiguration och fjärr-advisors är ännu inte verifierade.
6. Bestäm driftbemanning för supportkön. Notifieringar kräver öppen adminvy. Offline-/bakgrundspush, e-post, SMS, eskalering till externa kanaler och svarstidslöfte ingår inte. Ingen sådan tjänst har provisionerats eller utlovats.
7. Hantera eller acceptera de dokumenterade befintliga globala test-/lintfelen inför release. Denna PR gör inte hela appen globalt grön.

Kod och lokala flöden är granskningsbara; aktivering och slutlig stagingverifiering återstår innan tjänsten kan kallas lanserad. Ingen merge eller produktionspublicering görs i detta uppdrag.
