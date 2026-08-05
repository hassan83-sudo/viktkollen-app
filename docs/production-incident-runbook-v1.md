# Production Incident Runbook V1

## Appen startar inte

1. Kontrollera senaste deploy och browser console i development/testmiljo.
2. Be anvandaren ladda om sidan.
3. Testa i inkognito eller annan browser.
4. Kontrollera service worker: DevTools > Application > Service Workers > Unregister.
5. Radera inte localStorage innan backup/export har forsokts.

## Auth fungerar inte

1. Kontrollera `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY`.
2. Kontrollera Supabase Auth status och redirect URLs.
3. Testa logout/login igen.
4. Kontrollera att inga tokens visas i logs eller screenshots.
5. Vid fortsatt fel: be anvandaren fortsatta lokalt offline tills auth ar tillbaka.

## Supabase nere

1. Bekrafta incident i Supabase dashboard.
2. Appen ska fortsatta lokalt.
3. Be anvandaren undvika restore under driftstorning.
4. Kor sync igen efter aterhamtning.

## Sync conflict

1. Oppna Sync Diagnostics i development.
2. Kontrollera konfliktstatus utan att kopiera ra payload.
3. Valj manuell konfliktlosning enligt UI.
4. Undvik silent overwrite.
5. Spara anonymiserad diagnosticsrapport.

## Sync stuck

1. Kontrollera natstatus.
2. Kontrollera cross-tab leader: stang extra flikar och oppna en ny.
3. Kor Sync now.
4. Om lease verkar stale: ladda om appen.
5. Radera inte syncmetadata utan backup.

## Offlineproblem

1. Kontrollera att appen tidigare oppnats online.
2. Kontrollera service worker cache i DevTools.
3. Kontrollera att API/Supabase inte cacheas.
4. Testa production build lokalt med `npm run build` och `npm run preview`.

## Service worker gammal

1. Klicka pa uppdateringsbanner om den finns.
2. Hardladda sidan.
3. Avregistrera service worker i DevTools.
4. Rensa Cache Storage for Viktkollen.
5. Ladda om online.

## Update loop

1. Avregistrera service worker.
2. Rensa Cache Storage.
3. Kontrollera att ny deploy inte byter SW-version i loop.
4. Verifiera att `controllerchange` bara reloadar efter aktiv update.

## Korrupt localStorage

1. Exportera/backup sa mycket som gar.
2. Identifiera vilken feature som faller.
3. Anvand feature-fallback i appen.
4. Kopiera anonymiserad nyckellista, inte ra data.
5. Radera aldrig all localStorage som forsta atgard.

## Backup/restore-fel

1. Kontrollera att pre-restore backup finns.
2. Kontrollera payloadstorlek och JSON-validering.
3. Restore endast fran kand Viktkollen-backup.
4. Vid fel: behall befintlig lokal data och visa sakert felmeddelande.

## Reminders dubbleras

1. Kontrollera om flera flikar ar oppna.
2. Ladda om den aktiva fliken.
3. Kontrollera `viktkollen.reminders.v2.schedulerLock` i development.
4. Kontrollera Notification Center och Reminder Center i samma browserprofil.
5. Kontrollera cross-tab leader innan en ny scheduler startas.
6. Kontrollera quiet hours och batching innan manuell resend.
7. Arkivera dubblettreminders, radera inte historik automatiskt.
8. Notification body ska aldrig innehalla kanslig halsodata.
9. Logga endast anonymiserad reminder-id/status, inte anvandartext.

## Social sharing eller privacyfel

1. Stang av leaderboard om den inte uttryckligen ar opt-in.
2. Kontrollera share preview innan nagot kopieras eller delas.
3. Dela inte ra payload, token, e-post, viktvarden eller kroppsjämförelser i felsokning.
4. Be anvandaren ladda om appen om lokal preview-state verkar stale.
5. Verifiera att Social Center fortfarande ar local-only i V1.

## Release acceptance av nya feature centers

1. Kor `npm run verify:release`.
2. Kontrollera att Data Import, Data Export, Achievement Center och Social Center inte modulepreloadas.
3. Oppna appen i desktop och mobilviewport.
4. Slutfor lokal onboarding och verifiera att lazy centers ar synliga utan console errors.

## Rapportfel

1. Testa byta period.
2. Ladda om appen.
3. Kontrollera att vikt/maltidsdata normaliseras via centrala tjanster.
4. Exportera inte ra stack trace till anvandaren.

## AI nere

1. Appen ska anvanda lokal fallback.
2. Kontrollera att AI Coach inte visar tekniska fel.
3. Kontrollera att ingen API-payload loggas.
4. Kor om nar nat/API ar tillbaka.

## Rollback till tidigare Vercel-deploy

1. Oppna Vercel deployments.
2. Valj senast verifierad deploy.
3. Promote to production.
4. Be anvandare uppdatera appen och service worker.
5. Verifiera auth, sync och PWA efter rollback.

## Samla anonymiserad diagnostics

1. Anvand Launch Readiness i development.
2. Kopiera rapporten.
3. Kontrollera att e-post, token, session och payload inte finns med.
4. Bifoga endast anonymiserad rapport i arendet.

## Anvandaren kan gora utan dataforlust

- Ladda om appen.
- Logga ut/in.
- Vanta tills natet ar tillbaka.
- Skapa manuell backup/export dar UI stoder det.
- Avregistrera service worker och ladda om online.
- Undvika restore tills problemet ar forstatt.

## Acceptance Test Data Incident

Om staging acceptance-testdata syns i fel konto eller inte kan rensas sakert:

1. Stoppa acceptance-korningen.
2. Kor ingen bred cleanup-query.
3. Identifiera endast poster markerade `TESTDATA_RELEASE_ACCEPTANCE_V1`.
4. Bekrafta Test User A/B scope i Supabase.
5. Anvand cleanup-guiden och read-only SQL-checks fore mutation.
6. Markera release `NOT READY` om cross-user visibility bekraftas.

## Release Candidate Blocker

Vid RC-blocker:

1. Stoppa go-live.
2. Klassificera enligt `docs/release-candidate-v1.md`.
3. Spara endast saker evidens utan credentials.
4. Reproducera med TESTDATA om mojligt.
5. Gor minimal fix och regressionstest.
6. Kor `npm run verify:release`.
7. Uppdatera RC-resultatet innan ny acceptance-passning.

## AI Provider Incident

Vid AI-providerfel:

1. Stang av remote AI i staging/production config om kostnad eller felrisk finns.
2. Kontrollera att regelbaserad fallback visas.
3. Kontrollera rate limit, timeout och providerstatus utan nyckelvarden.
4. Logga endast saker felkod och request-id.
5. Exportera inte prompt eller providerresponse.
6. Markera release `NOT READY` om nyckel exponeras, raa halsodata skickas eller providerresponse sparas.
## AI Route Security Incident

Prioritet hog om en kostnadsbarande route kan nas utan verifierad auth.

Stoppa forst:

1. Stang av remote coach och remote photo analysis i hostingmiljon.
2. Rotera OpenAI-nyckeln om providertrafik kan ha missbrukats.
3. Aterkalla relevanta Supabase-sessioner vid misstankt sessionslacka.
4. Rulla tillbaka till senaste sakra commit om authkravet regressat.

Kontrollera sedan:

- `npm run verify:coach-route -- --url <preview>`
- `npm run verify:photo-route -- --url <preview>`
- saknad auth ger 401
- `no-store` finns
- rate-limit anvander inte clientvalda scope
- inga tokens, user IDs eller provider bodies finns i loggar

Ateraktivera forst nar route-preflight och release-gate passerar.

## Coach Memory Privacy Incident

Stoppa remote memory om prompts, providerresponses, raw history, auth/session eller identifierare misstanks ha inkluderats i memory context. Bevara lokal regelbaserad fallback, rensa berord derived memory och verifiera `coachMemory` allowlisten innan remote memory aktiveras igen.
