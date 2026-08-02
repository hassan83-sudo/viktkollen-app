# Production Incident Runbook V1

## Appen startar inte

1. Kontrollera senaste deploy och browser console i development/testmiljö.
2. Be användaren ladda om sidan.
3. Testa i inkognito eller annan browser.
4. Kontrollera service worker: DevTools > Application > Service Workers > Unregister.
5. Radera inte localStorage innan backup/export har försökts.

## Auth fungerar inte

1. Kontrollera `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY`.
2. Kontrollera Supabase Auth status och redirect URLs.
3. Testa logout/login igen.
4. Kontrollera att inga tokens visas i logs eller screenshots.
5. Vid fortsatt fel: be användaren fortsätta lokalt offline tills auth är tillbaka.

## Supabase nere

1. Bekräfta incident i Supabase dashboard.
2. Appen ska fortsätta lokalt.
3. Be användaren undvika restore under driftstörning.
4. Kör sync igen efter återhämtning.

## Sync conflict

1. Öppna Sync Diagnostics i development.
2. Kontrollera konfliktstatus utan att kopiera rå payload.
3. Välj manuell konfliktlösning enligt UI.
4. Undvik silent overwrite.
5. Spara anonymiserad diagnosticsrapport.

## Sync stuck

1. Kontrollera nätstatus.
2. Kontrollera cross-tab leader: stäng extra flikar och öppna en ny.
3. Kör Sync now.
4. Om lease verkar stale: ladda om appen.
5. Radera inte syncmetadata utan backup.

## Offlineproblem

1. Kontrollera att appen tidigare öppnats online.
2. Kontrollera service worker cache i DevTools.
3. Kontrollera att API/Supabase inte cacheas.
4. Testa production build lokalt med `npm run build` och `npm run preview`.

## Service worker gammal

1. Klicka på uppdateringsbanner om den finns.
2. Hårdladda sidan.
3. Avregistrera service worker i DevTools.
4. Rensa Cache Storage för Viktkollen.
5. Ladda om online.

## Update loop

1. Avregistrera service worker.
2. Rensa Cache Storage.
3. Kontrollera att ny deploy inte byter SW-version i loop.
4. Verifiera att `controllerchange` bara reloadar efter aktiv update.

## Korrupt localStorage

1. Exportera/backup så mycket som går.
2. Identifiera vilken feature som faller.
3. Använd feature-fallback i appen.
4. Kopiera anonymiserad nyckellista, inte rå data.
5. Radera aldrig all localStorage som första åtgärd.

## Backup/restore-fel

1. Kontrollera att pre-restore backup finns.
2. Kontrollera payloadstorlek och JSON-validering.
3. Restore endast från känd Viktkollen-backup.
4. Vid fel: behåll befintlig lokal data och visa säkert felmeddelande.

## Reminders dubbleras

1. Kontrollera om flera flikar är öppna.
2. Ladda om den aktiva fliken.
3. Kontrollera `viktkollen.reminders.v2.schedulerLock` i development.
4. Arkivera dubblettreminders, radera inte historik automatiskt.
5. Notification body ska aldrig innehålla känslig hälsodata.

## Rapportfel

1. Testa byta period.
2. Ladda om appen.
3. Kontrollera att vikt/måltidsdata normaliseras via centrala tjänster.
4. Exportera inte rå stack trace till användaren.

## AI nere

1. Appen ska använda lokal fallback.
2. Kontrollera att AI Coach inte visar tekniska fel.
3. Kontrollera att ingen API-payload loggas.
4. Kör om när nät/API är tillbaka.

## Rollback till tidigare Vercel-deploy

1. Öppna Vercel deployments.
2. Välj senast verifierad deploy.
3. Promote to production.
4. Be användare uppdatera appen och service worker.
5. Verifiera auth, sync och PWA efter rollback.

## Samla anonymiserad diagnostics

1. Använd Launch Readiness i development.
2. Kopiera rapporten.
3. Kontrollera att e-post, token, session och payload inte finns med.
4. Bifoga endast anonymiserad rapport i ärendet.

## Användaren kan göra utan dataförlust

- Ladda om appen.
- Logga ut/in.
- Vänta tills nätet är tillbaka.
- Skapa manuell backup/export där UI stöder det.
- Avregistrera service worker och ladda om online.
- Undvika restore tills problemet är förstått.
