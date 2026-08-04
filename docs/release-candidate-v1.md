# Release Candidate V1

Release Candidate V1 forbereder Viktkollen for riktig staging/production-preview acceptance. Den har sprinten markerar inte externa floden som godkanda om de inte faktiskt har korts.

## Startlage

- Branch: `main`
- Senaste commit vid start: `446e905 Add staging acceptance tools and validation`
- Arbetskatalog vid start: ren
- `npm run validate:staging`: 9 PASS, 0 FAIL, 2 SKIP
- Release-status fore externa tester: `CONDITIONAL`

## Automatiskt verifierat lokalt

- Staging validator kan koras utan att skriva ut envvarden.
- Photo route preflight kan kontrollera routefil och sakert hoppa over remote/provider utan config.
- Supabase read-only SQL-underlag finns och innehaller checks for tabeller, RLS, policies, kolumner och index.
- Production build skapar PWA-filer.
- Release-gate kontrollerar att tunga lazy centers och acceptance-runner inte modulepreloadas.
- ManualAcceptanceRunner ar development-only och finns inte i production bundle.
- TESTDATA-fixtures ar development/test-only och markerade med `TESTDATA_RELEASE_ACCEPTANCE_V1`.

## Blockerat av miljo

Foljande ar inte PASS i denna lokala Codex-session:

- Riktig Supabase Auth med Test User A/B.
- RLS/cross-user isolation mot riktig databas.
- Multi-device sync, conflict och leader takeover.
- Cloud Backup/Restore mot riktig Supabase.
- Riktig Vercel preview verification utan angiven preview-URL.
- Riktig nutrition photo provider-analys utan server-side `OPENAI_API_KEY` och explicit godkannande.
- Systemnotifications pa riktig browserprofil/enhet.

## Secret Audit

Audit anvande monster for servernycklar, bearer tokens, service-role, access/refresh tokens och losenord. Inga faktiska credentials ska finnas i repo eller rapporter. Traffar som ar tillatna:

- env-namn i docs/scripts
- server-side API-route-anvandning
- tester som verifierar redaction
- export/import-filter som blockerar tokens

## Supabase/RLS-underlag

`supabase/release_acceptance_checks.sql` ar read-only som standard och ska koras i Supabase SQL Editor. Resultaten maste tolkas manuellt:

- alla user-owned tabeller ska ha RLS enabled
- policies ska scopa till `auth.uid() = user_id`
- `user_sync_state` ska ha unik constraint eller index per user
- ingen client-policy far tillata cross-user access

Utan direkt Supabase-atkomst ar detta `blockedByEnvironment`, inte PASS.

## Preview Verification

Om preview-URL finns:

```bash
npm run verify:preview -- https://preview-url
```

Om ingen preview-URL finns ar Vercel preview `blockedByEnvironment`. Anvand ingen pahittad URL.

## Release Blocker Policy

Markera `NOT READY` direkt vid:

- cross-user data leakage
- RLS failure
- exposed secret
- silent sync overwrite
- backup fran fel user
- restore till fel user
- permanent data loss
- app crash i huvudflode
- PWA reload-loop
- remote image sparas permanent
- auth/session i export
- testverktyg i production bundle

Markera `CONDITIONAL` nar externa tester saknas men lokal release-gate ar gron och inga blocker/high hittats.

Markera `READY` endast nar real staging/preview acceptance ar manuellt verifierad med Test User A/B och inga blocker/high finns.

## Slutstatus

Aktuell RC-status: `CONDITIONAL`.

Motivering: lokal automation och enablement ar redo, men externa Supabase-, RLS-, multi-device-, backup/restore-, notification-, photo-provider- och Vercel-floden aterstar.
