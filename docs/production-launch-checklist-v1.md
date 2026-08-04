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
