# Granskning av AI-kundtjänst och AI-Hjälp

Granskad 2026-10-17 från `origin/main` på commit `8a9597da1f288d0f2545c51d0f313e7738769c0d`.
Arbetsgren: `codex/ai-support-review`. Ingen merge, publicering eller kontoändring har utförts.

## Var användaren hittar funktionerna

| Funktion | Exakt väg och användning | Status i koden |
| --- | --- | --- |
| AI-Hjälp | Nedre navigeringen → Mer → Inställningar → AI-Hjälp → Öppna AI-Hjälp → skriv fråga → Skicka | Ansluten frontend, autentiserad server och kunskapskatalog. |
| AI-kundtjänst | Samma panel. Fråga exempelvis ”Vilket abonnemang har jag?” eller ”Hur mycket matscanning har jag kvar?” | Servern läser den inloggades verifierade abonnemang, plan, användning, rättigheter och betalningsstatus. Ingen separat kundtjänstvy. |
| Avancerad AI-kundtjänst | Samma panel. Be om en annan förklaring eller ställ en följdfråga. Ingen separat knapp eller vy. | Modellanrop med relevant katalog och upp till åtta meddelanden. Kräver servernyckel, positiv budget och fungerande delad kostnadsdatabas. |
| Uppsägning via AI-Hjälp | Samma panel → uttryckligen be att säga upp abonnemanget → läs erbjudandet → Bekräfta uppsägning | Separat autentiserat POST till `/api/billing/cancel`. Ingen uppsägning genom enbart chatttext. |
| Teknisk felrapport | Samma panel → Rapportera tekniskt fel | Kopplad till bugMonitor. Chattfrågan skickas inte med. Detta är inte mänsklig kundtjänst. |
| Mänsklig support | Ingen fungerande kontaktväg i den granskade panelen | Saknas: verifierad kontaktadress eller annan kanal, ärendehantering och överlämning. Panelen upplyser nu om detta. |
| Ändra profil | Mer → Inställningar → Ändra profil | Separat manuell funktion; AI-Hjälpen ändrar inte profilen. |

`MoreSection.jsx` monterar panelen enbart i mappen `installningar`.
`vercel.json` kopplar `/api/ai-help` till `/api/ai?__vk_route=ai-help`.
`api/ai/index.js` skickar vidare till den gemensamma AI-Hjälp-handlern.
AI Coach är en separat hälsofunktion och omfattas inte av denna granskning.

## Genomförda reparationer

- Gamla chatttrådar tas bort ur sessionStorage. Kundfakta och uppsägningsknappar sparas inte längre där.
- Panelen monteras om när användar-id ändras. Konversationen börjar då om.
- Klienten kontrollerar att samma konto fortfarande är inloggat innan ett svar visas.
- En uppsägningsbekräftelse binds till kontot som fick erbjudandet. Ett annat kontos token får inte användas för den gamla knappen.
- En ny fråga tar bort tidigare uppsägningserbjudanden. Bekräftelseknappen är avstängd under pågående anrop.
- ”Jag vill avsluta mitt konto/chatten” utlöser inte längre abonnemangsuppsägning. Abonnemang eller prenumeration måste anges uttryckligen.
- Gränssnittet lovar inte längre att en obesvarad fråga har blivit ett supportärende. Modellinstruktionen förbjuder påhittad supportkontakt, överlämning och svarstid.
- AI-Hjälpens Playwright-tester undantas från Vitest och en inaktuell förväntad välkomsttext har rättats.
- Ett lintfel i kundkontextens lokala variabel har rättats.

## Vad verifieringen visar

| Område | Verifierat resultat och begränsning |
| --- | --- |
| Gratis/premium | Samma hjälppanel och API för alla autentiserade användare; ingen premiumspärr i hjälptjänsten. Syntetiska free/premium-planer testas med injicerade läsare. Verkliga betalande/gratis konton har inte använts. Avancerade svar begränsas av serverbudget och frekvensgräns, inte av en separat premiumkontroll här. |
| Följdfrågor | Testad kedja panel → klient → handler → tjänst → simulerad modell → panel skickar historik, språk och tidigare featureIds. Kort referens som ”öppna den” använder tidigare katalogträff. Personliga kundfrågor väljs primärt från senaste frågetexten; godtyckliga korta faktauppföljningar är inte verifierade. |
| Språk | Svenska och engelska gränssnittstexter. Övriga språk får engelska kontroller. Aktiv språkkod skickas till modellen; arabiska ger RTL och kinesiska språkkoder bevaras i tester. Deterministiska kundsvar är svenska eller engelska; katalogfallback är svensk. Full lokalisering av samtliga språk är inte färdig. |
| Behörighet | Handlern verifierar bearer-token och använder serverns användar-id. Ett user_id i frågans payload ger inte tillgång till någon annans data. Oinloggade anrop nekas. Testat med verifierardubbel och avvisat testtoken i webbläsaren. |
| Kontoåtgärder | AI kan föreslå navigering från tillåtelselista och erbjuda separat uppsägningsbekräftelse. Den kan inte radera konton, köra SQL, ändra profil eller betalning. Konto-raderings- och livscykeltester ingår i den fokuserade körningen. Inga riktiga kontoåtgärder kördes. |
| Felfall | Befintliga tester täcker modellbudget, frekvensgräns, saknad provider, otillgängliga kundfakta, felaktiga modellsvar och filtrering av påhittade priser. |
| Obesvarade frågor | `unansweredStore.js` är en processlokal lista med högst 100 poster. Den är inte varaktig ärendehantering och innebär inte att någon människa ser frågan. |

## Testresultat

- Fokuserad körning: **16 testfiler, 123 tester godkända**. Omfattar AI-Hjälp, kundkontext, kostnadsskydd, klientens kontogränser, identitetskontroll, abonnemangslivscykel och kontoradering. Modell och billing använder testdubblar.
- Playwright: **2 av 2 godkända**, mobilvy 390 × 844. Verifierar verklig navigering via Mer/Inställningar, öppna/stäng, layout samt API-anrop som avvisas säkert utan servernyckel i svaret. Testserver och simulerad session; inte produktion.
- `npm run build`: godkänd. Vite varnar för stora JavaScript-chunks.
- ESLint för ändrade kodområden och `git diff --check`: godkända.
- `npm run lint` för hela projektet: 51 fel och 9 varningar vid första körningen. Ett av felen var i kundkontexten och har rättats; övriga ligger utanför ändringarna här.
- Slutlig full `npm test`: 420 testfiler godkända, 27 misslyckade; 5059 tester godkända, 70 misslyckade och ett ohanterat DOM-fel i NoticeHub. Bland felen finns PWA, kroppsscanning, näringsanalys, notiser och ett API-test som kräver exakt 11 funktioner trots att trädet innehåller 12. Inga av de fokuserade AI-Hjälp-testfilerna misslyckades. Dessa globala problem är inte generellt reparerade i detta scope. Körlogg: `ai-support-full-tests.log`.

## Kvar innan allt kan kallas färdigt i drift

1. Ange och anslut en verifierad mänsklig supportkanal och mottagande ärendeprocess. Ingen kontaktuppgift har hittats på.
2. Verifiera servernyckel, budget och delad kostnadsdatabas i avsedd stagingmiljö. Produktionskonfiguration och faktiska modell-/billinganrop har inte kontrollerats i detta arbete.
3. Kör ett godkänt stagingflöde med riktiga testkonton för gratis/premium och faktiska verifierade abonnemangsdata. Uppsägning ska bara provas på ett uttryckligen avsett testabonnemang.
4. Slutför lokalisering om alla appens språk ska ha fullt översatta kontroller, kundsvar och fallback utan modell.
5. Åtgärda och kör om projektets globala tester/lint innan hela appen godkänns för release.

Resultatet är verifierat för de angivna lokala flödena, men hela appen och driftmiljön är inte releasegodkända. Main ska fortsatt lämnas orörd.
