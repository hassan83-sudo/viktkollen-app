# Manual Release Acceptance V1

## Syfte

Manual Release Acceptance V1 kompletterar `npm run verify:release` med manuella kontroller som kräver riktiga Supabase-credentials, två verkliga flikar, installerad PWA och produktionslik deployment. Guiden lägger inte till produktfunktioner och ska inte lagra credentials, tokens, sessionsdata, rå localStorage, rå Supabase-payload eller hälsodata.

## Förutsättningar

- Kör först `npm run verify:release`.
- Använd en separat testanvändare och testdata som kan raderas efteråt.
- Använd placeholders i anteckningar: `<test-email>`, `<test-user-id-prefix>`, `<deployment-url>`.
- Lägg aldrig service-role-key i klienten.
- Spara bara anonymiserade observationer i `docs/manual-release-acceptance-template.json` eller en kopia av den.

Status för varje steg: `passed`, `failed` eller `not_tested`.

Kommentarer ska saneras innan de sparas:

- Ta bort e-postadresser.
- Ta bort lösenord, tokens, sessionsvärden och auth headers.
- Ta bort rå localStorage och Supabase JSON.
- Ersätt fullständiga user-id:n med kort prefix, till exempel `<user-a-1234>`.
- Skriv inte vikt, måltider eller annan hälsodata i rapporten.

## 1. Release Validation V1

1. Läs `docs/release-validation-v1.md`, `docs/release-report.md`, `docs/release-report.json`, `docs/production-launch-checklist-v1.md` och `docs/production-incident-runbook-v1.md`.
2. Kontrollera att `scripts/verify-release.js`, `playwright.config.js`, `tests/e2e/*` och `package.json` beskriver samma release-gate.
3. Kör `npm run verify:release`.
4. Kontrollera `git status --short --untracked-files=all`.
5. Bekräfta att inga Playwright-artefakter, credentials eller hemligheter ligger kvar.

Förväntat: release-gate passerar, inga hemligheter hittas, kvarvarande manuella kontroller är dokumenterade.

## 2. Supabase Auth Acceptance

1. Kontrollera Vercel eller lokal miljö:
   - `VITE_SUPABASE_URL` finns.
   - `VITE_SUPABASE_ANON_KEY` finns.
   - Ingen service-role-key finns i klientmiljö.
2. Kontrollera Supabase Auth:
   - Production URL och preview URL finns i allowed redirect URLs.
   - E-postbekräftelsekrav är känt innan testet.
3. Skapa testanvändare med `<test-email>` och temporärt lösenord.
4. Bekräfta e-post om projektet kräver det.
5. Logga in.
6. Ladda om sidan och verifiera att sessionen finns kvar.
7. Vänta tills session refresh borde ha skett, eller trigga reload/focus, och kontrollera att användaren inte loggas ut oväntat.
8. Logga ut.
9. Logga in som annan testanvändare.
10. Kontrollera att föregående användares molnstatus, backups eller syncdata inte visas.
11. Kontrollera RLS i Supabase:
    - `user_backups` visar bara aktuell testanvändares rader.
    - `user_sync_items` visar bara aktuell testanvändares rader.

Förväntat: auth är isolerad per användare, inga tokens visas i UI/loggar, ingen gammal användares data läcker efter user switch.

Säker borttagning efter test: radera testanvändaren och dess testdata via Supabase dashboard eller säkert adminflöde. Dokumentera bara anonymiserat att borttagning genomfördes.

## 3. Cloud Backup och Restore

1. Logga in med testanvändare.
2. Skapa minimal lokal testdata i appen.
3. Öppna Cloud Backup.
4. Skapa molnbackup.
5. Kontrollera att backup visas med anonymiserad tid/status, inte rå payload.
6. Ändra lokal testdata.
7. Förhandsgranska molnversion.
8. Kör restore.
9. Verifiera att lokal testdata återgår till backupens förväntade läge.
10. Verifiera att auth-sessionen inte ändras.
11. Verifiera att reminders och Goals/Habits finns kvar eller återställs enligt backupinnehållet.
12. Ladda om appen.
13. Simulera fel där det är säkert, till exempel offline före restore-preview, och verifiera begripligt fel utan dataradering.
14. Kontrollera att pre-restore snapshot/rollback finns om restore påbörjats.

Förväntat: ingen silent overwrite, restore skyddar befintlig data, rollback/snapshot kan användas vid fel.

## 4. Cloud Sync Acceptance

Testa varje scenario med liten, anonym testdata.

- `local-only`: skapa lokal ändring, kör sync, kontrollera upload.
- `remote-only`: skapa/ändra molnrad via annan flik eller kontrollerat testflöde, kör sync, kontrollera download.
- `both changed`: ändra lokal och remote före sync, kontrollera konflikt.
- `choose local`: lös konflikt till lokal version.
- `choose cloud`: lös konflikt till molnversion.
- `offline queue`: gör ändring offline, återanslut, kontrollera retry.
- `online reconnect`: kontrollera att sync återupptas utan dubbel upload.
- `snapshot`: kontrollera att skydd finns före riskfylld apply.
- `rollback`: verifiera återställning där UI eller runbook stöder det.

Kontrollera samtidigt:

- GlobalSyncStatus visar rätt status.
- CloudStatusPanel visar rätt status.
- CloudSyncPanel visar rätt status.
- Supabase-tabellerna innehåller förväntade rader för aktuell testanvändare.

Förväntat: ingen silent overwrite, inga dubbla uploads, inga råa payloads i rapporten.

## 5. Två Verkliga Flikar

1. Öppna två flikar med samma testanvändare.
2. Öppna development diagnostics om miljön tillåter det.
3. Kontrollera leader/follower-status.
4. Gör en dirty-ändring i follower.
5. Kontrollera att leader hanterar sync.
6. Begär manuell sync från follower.
7. Verifiera att ingen dubbel upload sker.
8. Stäng leader-fliken.
9. Vänta på takeover och dokumentera observerad tid, utan att göra produktionslöfte.
10. Sätt en flik offline.
11. Gör en liten ändring.
12. Återanslut och kontrollera queue/retry.
13. Logga ut i leader.
14. Logga in som annan testanvändare och kontrollera att fel användares sync inte kör.

Förväntat: follower tar över säkert, ingen dubbelsync, ingen användarblandning.

## 6. Reminder Acceptance

1. Skapa reminder.
2. Kontrollera due banner.
3. Snooza.
4. Hoppa över.
5. Markera klar.
6. Pausa och återuppta.
7. Arkivera och återställ.
8. Testa Notification permission via knapp.
9. Öppna två flikar och kontrollera scheduler-leader.
10. Stäng leader och verifiera takeover.
11. Testa offline och återupptagning.
12. Logga ut och verifiera att reminder inte fortsätter för utloggad användare.
13. Kontrollera att Reminder Center laddas lazy i build eller DevTools network.

Förväntat: ingen dubbelnotis, ingen känslig notification-text, ingen reminder efter logout.

## 7. PWA Acceptance

Chrome/Edge:

1. Öppna `<deployment-url>`.
2. Kontrollera manifest i DevTools.
3. Installera appen via browserns PWA-flöde.
4. Starta standalone.
5. Ladda appen online en gång.
6. Gå offline.
7. Ladda om och verifiera app shell.
8. Verifiera att Supabase/API/auth inte fungerar via cache utan visar säker offline/fallback.
9. Deploya eller byt till ny testbuild.
10. Kontrollera update-banner.
11. Klicka `Uppdatera nu`.
12. Kontrollera `controllerchange` och att ingen reload-loop sker.
13. Kontrollera att lokal data finns kvar.

iPhone/iOS:

1. Lägg till på hemskärmen via Safari.
2. Kontrollera standalone-läge.
3. Testa offline reload efter tidigare onlinebesök.
4. Dokumentera att `beforeinstallprompt` inte stöds på iOS.
5. Dokumentera att web push/background-notiser är begränsade och att appen inte lovar bakgrundsnotiser när den är stängd.

Förväntat: installation/offline/update fungerar där plattformen stöder det, och begränsningar dokumenteras.

## 8. Vercel Production Acceptance

1. Kontrollera environment variables i Vercel.
2. Kontrollera build command och output.
3. Deploya via Vercel, inte via detta script.
4. Spara deployment URL som `<deployment-url>`.
5. Kontrollera:
   - `/manifest.webmanifest`
   - `/sw.js`
   - PWA-ikoner
   - hashade `/assets/...`
   - Supabase redirect URLs
   - Supabase allowed URLs
   - cache headers där relevant
   - API routes eller lokal OpenAI fallback
6. Kör post-deploy smoke:
   - appstart
   - login/logout
   - Cloud Backup preview
   - AI Coach fallback
   - offline efter första besök
   - console/network health

Förväntat: production-deploy beter sig som lokal production-preview, utan console errors, brutna imports eller PWA-regressioner.

## 9. Release Decision

READY:

- Automatiserad gate är grön.
- Inga blockerande manuella fel.
- Auth verifierad.
- Backup/restore verifierad.
- Sync och takeover verifierade.
- PWA offline/update verifierade.
- Inga känsliga dataläckor.

CONDITIONAL:

- Endast dokumenterade icke-blockerande begränsningar kvar.
- Begränsningarna har tydlig workaround eller runbook.

NOT READY:

- Dataförlust.
- Authisolering misslyckas.
- RLS-fel.
- Sync overwrite utan användarval.
- Update loop.
- Offline-start blockerad efter tidigare besök.
- Dubbla reminders/notiser.
- Känsliga data i loggar, UI eller export.

## 10. Rapportering

Använd `docs/manual-release-acceptance-template.json` som mall. Skapa en separat kopia för faktisk körning och kontrollera privacy checklist innan rapporten delas.

Fält som ska fyllas:

- version/commit
- datum
- miljö
- browser och viewport/device
- kontroll-id
- status
- anonymiserad kommentar
- blockerande/icke-blockerande
- verifierare
- releasebeslut

Rapporten får inte innehålla e-post, lösenord, token, session, rå localStorage, rå Supabase-payload, hälsodata eller fullständiga användar-ID:n.
