# Production Launch Checklist V1

## Automatiskt verifierat

- `npm test -- --run` passerar.
- `npm run lint` passerar.
- `npm run build` passerar.
- `git diff --check` passerar.
- PWA-filer ska finnas i `dist`: manifest, service worker och ikoner.
- `dist/index.html` ska inte modulepreloada stora lazy featurevyer som Reminder Center, rapportdrilldown eller cloud backup-panelen.
- Error boundary visar säkert fel-id och inte stack trace.
- Logger maskerar token, session, e-post, lösenord, base64/bilder och rå payload.
- `viktkollen.reminders.v2` är sync-/backup-nyckel.
- `viktkollen.reminders.v2.schedulerLock` är teknisk nyckel och ska inte syncas eller backupas.

## Environment

- `VITE_SUPABASE_URL` finns i production.
- `VITE_SUPABASE_ANON_KEY` finns i production.
- Ingen service-role-key finns i klientmiljö.
- `VITE_APP_VERSION` sätts vid release om versionsmärkning används.
- Vercel project settings använder rätt branch och build command.

## Supabase

- RLS är aktiverat på relevanta tabeller.
- SQL-migrationer är körda i rätt miljö.
- Anon key har endast förväntade rättigheter.
- Auth redirect URLs matchar production-domänen.
- Testa expired session och session refresh manuellt.

## Auth

- Utloggad appstart fungerar.
- Login fungerar.
- Logout under pågående sync/AI/export kraschar inte appen.
- Användarbyte i annan flik visar inte gammal användares molnstatus.
- Inga tokens visas i UI eller loggar.

## Backup och Sync

- Cloud Backup kan skapa backup.
- Restore skapar skydd före riskfylld återställning.
- Sync now fungerar online.
- Offline queue återhämtar sig när nätet återkommer.
- Konflikter visas utan silent overwrite.
- Cross-tab leader takeover fungerar efter stängd leader.
- Stora payloads stoppas med begripligt fel.

## Cloud Sync V3

- Två riktiga enheter med samma konto kan synka utan dubbla uploads.
- Lokal ändring på enhet A och remote ändring på enhet B får rätt beslut: lokal vinner, moln vinner, säker merge eller manuell konflikt.
- Säker merge används bara när olika stabila objekt kan slås ihop deterministiskt.
- Samma objekt ändrat på två enheter visas som manuell konflikt.
- Manuell konflikt kan lösas med lokal version, molnversion eller säker merge när den är tillåten.
- Offlineändringar köas och skickas efter reconnect utan syncstorm.
- Tombstone/radering skrivs inte över tyst av äldre aktiv data.
- Stale enheter visas som gamla utan att full user agent, IP eller rå device-id exponeras.
- Restore på ny enhet skapar skydd och kan återhämta sig vid fel.
- Logout eller användarbyte under väntande sync visar inte tidigare användares status eller data.
- Sync History och diagnostics innehåller inte rå payload, token, session, e-post, bilder eller hälsodata.
- Development-panelen Sync Health är lazy-loaded och ska inte modulepreloadas i production.

## PWA

- `manifest.webmanifest` är nåbart.
- 192/512/maskable-ikoner laddas.
- Installation fungerar i Chrome/Edge.
- Offline app shell öppnas efter tidigare besök.
- Service worker uppdateringsbanner visas vid ny version.
- `skipWaiting` ger säker reload utan dataradering.
- Supabase/API/auth-anrop cacheas inte.
- Gamla caches rensas.

## Reminders

- Ingen reminder skapas utan användarval.
- Skapa, redigera, snooza, hoppa över, markera klar och arkivera fungerar.
- Notification permission begärs endast via knapp.
- Permission denied ger in-app fallback.
- Två flikar ger normalt bara en scheduler-leader.
- Reminder Center är lazy-loaded.

## Notifications V3

- Notification Center är lazy-loaded och ska inte modulepreloadas i production.
- Quiet hours stoppar browsernotiser under valt intervall.
- Flera närliggande notiser batchas till en neutral samlad notis.
- Completed, postponed och dismissed syns i säker historik.
- Notishistorik innehåller inte rå payload, tokens, bilder eller fullständiga source-id:n.
- Synckonflikter kan visas som notissignal utan att rå konfliktdata exponeras.
- Två flikar ska inte skapa dubbla notiser när scheduler leader-lock fungerar.
- `viktkollen.reminders.v2.notificationsV3` följer Cloud Sync V3 och backup/restore.

## Reports och Export

- Veckorapport renderar utan tekniska värden.
- Månadsrapport renderar utan tekniska värden.
- Export/print/drill-down fungerar utan raw stack traces.
- Export innehåller inte auth/session/token.

## AI fallback

- AI Coach fungerar utan OpenAI/API.
- AI-fel ger lokal fallback.
- Inga tokens eller rå payloads loggas.
- Chatten visar inte `NaN`, `undefined`, `null` eller `[object Object]`.

## Nutrition Scanner

- `OPENAI_API_KEY` finns endast server-side om remote bildanalys ska vara aktiv.
- `NUTRITION_PHOTO_MODEL`, maxstorlek, timeout och rate limit ar satta i production.
- `VITE_NUTRITION_PHOTO_REMOTE_ENABLED` speglar om remote analys ska visas som aktiv i readiness.
- `/api/nutrition-photo-analysis` svarar sakert utan config och lacker inte stack trace, nyckel eller bilddata.
- Remote analys kraver aktivt samtycke och startar inte automatiskt vid bildval.
- Offline blockerar remote analys utan retry-ko eller bakgrundsuppladdning.
- Invalid MIME, spoofad filsignatur och for stor bild blockeras.
- Review sparar endast granskad maltid och minimal `photoAnalysis`-metadata.
- LocalStorage, sync, backup, diagnostics och rapporter innehaller ingen bild, blob URL eller base64.
- Dashboard, veckorapport och manadsrapport visar endast sakra fotoanalysfacts.

## Nutrition Coach Engine V2

- `docs/ai-nutrition-coach-v2.md` dokumenterar den äldre AI Nutrition Coach V2 + Personal Insights-arkitekturen.
- `docs/nutrition-coach-engine-v2.md` dokumenterar den nya måltidskvalitetsmotorn, Nutrition Coach Center och consent-gated AI refinement.
- Nutrition Coach Center är lazy-loaded och ska inte modulepreloadas i production.
- Remote nutrition coach refinement får endast skicka aggregerade metrics, kategorier och counts.
- Råbilder, råhistorik, authdata, tokens och komplett användardata får inte skickas i nutrition coach-payloaden.
- Nutrition Coach Engine använder befintlig nutrition, scannerhistorik, coach memory, action plans, insights och dietary preferences utan ny sync-, auth- eller backupmodell.

## Predictive Health Intelligence V1

- `docs/predictive-health-intelligence-v1.md` dokumenterar prediction engine, early warnings, opportunities och AI-gränser.
- Prediction Center är lazy-loaded och ska inte modulepreloadas i production.
- Prediction engine får endast använda befintliga aggregerade data och ska aldrig skapa ny auth, sync, backup, storage key eller databastabell.
- Early warnings ska vara stödjande och får inte uttryckas som diagnos eller medicinsk bedömning.
- Remote AI får endast se aggregerade prediction summaries, confidence och kategorier när befintligt samtycke finns.

## Accessibility

- Tangentbord fungerar för reminders, modaler, reports och PWA banners.
- Focus return fungerar i modaler där det är implementerat.
- `aria-live` används för status/fel.
- Formfel har `aria-invalid`/`aria-describedby` där det är relevant.
- Färg är inte enda signal för kritiska statusar.

## Security och Privacy

- Ingen `dangerouslySetInnerHTML` utan separat granskning.
- Ingen `eval` eller dynamisk kodkörning.
- Object URLs revokas efter användning.
- Importerade filer valideras.
- Diagnostics maskerar URL/id där det behövs.
- LocalStorage-korruption raderar inte användardata automatiskt.

## Rollback

- Spara senaste fungerande Vercel deployment-id.
- Rollbacka via Vercel dashboard eller CLI.
- Be användare hårdladda och vid PWA-problem avregistrera service worker enligt runbook.
- Radera inte localStorage som första åtgärd.

## Post-release

- Kontrollera appstart i clean browser profile.
- Kontrollera install/offline/update i Chrome och Edge.
- Kontrollera login/logout.
- Kontrollera backup/restore med testkonto.
- Kontrollera sync mellan två flikar och två enheter.
- Kontrollera reminders i vanlig flik och installerad PWA.
- Kontrollera rapport/export/print.

## Data Import & Migration V2

- Data Import V2 visar preview innan nagon lokal data skrivs.
- Aktuell Viktkollen-backup kan importeras via safe merge.
- Legacy backup kan importeras med migrationsvarning.
- CSV meals, CSV weight och CSV check-ins identifieras korrekt.
- Ogiltig importfil blockeras med begriplig svensk text.
- Dubbletter visas i preview innan import.
- Replace kraver uttrycklig bekraftelse.
- Rollback aterstaller berorda nycklar vid simulerat skrivfel.
- Import pa ny enhet markerar berorda keys dirty for sync.
- User switch fore apply avbryter importen.

## Data Export & Portability V2

- Data Export Center visar preview innan nagon fil skapas.
- Full Viktkollen-backup verifieras med Data Import V2 innan download.
- Selektiv JSON-export visar valda sektioner och record counts.
- CSV meals, CSV weight och CSV check-ins kan laddas ned efter bekraftelse.
- Auth, session, tokens, diagnostics, raw sync payload, base64 och Blob URL saknas i exportpayload.
- Progressbilder exporteras endast som saker metadata eller exkluderas.
- Formula injection neutraliseras i CSV.
- Filnamn saneras mot path traversal.
- User switch fore download blockerar exporten.
- DataExportCenter ar lazy-loaded och ska inte modulepreloadas.

## Smart Goals & Achievements V2

- Achievement Center ar lazy-loaded och ska inte modulepreloadas.
- Achievements lagras endast som metadata i `viktkollen.goalsHabits.v2`.
- Inga nya auth-, databas-, backup- eller syncmodeller finns.
- Safety-filter blockerar skuld, straff, extrem viktminskning och lag kalorikonsumtion.
- XP ar capped och anvands inte som valuta, ranking eller leaderboard.
- Challenges sparas forst nar anvandaren aktivt startar eller avfardar dem.

## Social & Accountability V1

- SocialCenter ar lazy-loaded och ska inte modulepreloadas.
- Progressdelning ar private-first och share preview anonymiserar kansliga falt.
- Invite tokens ar lokala modeller och skickas inte automatiskt.
- Leaderboard ar endast opt-in och far inte anvanda vikt eller medicinsk data.
- Social readiness, privacy readiness och sharing readiness syns i Launch Readiness.

## Manual Release Acceptance V2

- `docs/manual-release-acceptance-v2.md` ska koras med Test User A och Test User B innan READY.
- Riktig Supabase Auth, RLS, Cloud Sync V3, Backup/Restore och Vercel acceptance ska verifieras i staging eller production preview.
- Nutrition photo route ska verifieras med syntetisk matbild utan persondata om remote photo analysis ar releasekrav.
- Notifications ska verifieras enligt browserstod och far inte skicka kanslig text.
- Nuvarande dokumenterat lage ar CONDITIONAL tills externa acceptance-steg ar genomforda.

## Staging & Real Acceptance Enablement V1

- Kor `npm run validate:staging` utan att exponera env-varden.
- Kor `supabase/release_acceptance_checks.sql` i Supabase SQL Editor och bekrafta RLS/user ownership manuellt.
- Kor `npm run verify:preview -- https://preview-url` mot vald Vercel preview.
- Anvand `ManualAcceptanceRunner` endast i development for PASS/FAIL/BLOCKED/NOT RUN pa externa floden.
- Skapa och rensa endast markerad `TESTDATA_RELEASE_ACCEPTANCE_V1`.

## Release Candidate V1

- Las `docs/release-candidate-v1.md`.
- Kor `docs/release-candidate-user-runbook-v1.md` i staging/preview.
- Uppdatera RC-resultatet utan credentials.
- READY kraver manuellt verifierad RLS, Test User A/B, multi-device, backup/restore och PWA.
- NOT READY vid data leakage, exposed secret, silent overwrite, felaktig restore, data loss, PWA reload-loop eller testverktyg i production bundle.

## OpenAI Production Integration V1

- `OPENAI_API_KEY` ska bara finnas server-side.
- `VITE_OPENAI_API_KEY` far aldrig finnas.
- Kor `npm run verify:coach-route` och `npm run verify:photo-route`.
- Remote coach ska krava aktivt samtycke och knapptryck.
- Regelbaserad fallback ska fungera vid missing config, timeout, rate limit, invalid response och safety block.
- Export/backup/sync far inte innehalla prompt, providerresponse, bild/base64 eller request headers.
## AI Route Security V2

- `/api/adaptive-coach` och `/api/nutrition-photo-analysis` ska krava Supabase-session.
- Saknad auth ska ge 401 och aldrig trigga OpenAI.
- Alla AI-route-svar ska ha `Cache-Control: no-store`.
- Rate limiting ska vara user-scoped och markeras som `process-local` tills global adapter finns.
- Client far inte skicka token i body, URL eller storage.

## Adaptive Coach Personalization V8

- Coach memory ska ligga under befintlig adaptive coach state.
- Remote memory ska vara opt-in.
- Preview ska visa minimerad AI-context utan ra historik.
- Forget/reset ska fungera utan att andra vikt, maltider eller mal.
