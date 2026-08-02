# Release Report

Status: redo för release-gate efter automatiserad verifiering.

## Senaste release-gate

Release Validation V1 etablerar ett repeterbart release-gate för Viktkollen som release candidate. Kontrollerna körs mot production build och production preview.

## Automatiserade kontroller

- Vitest full svit, körning 1
- Vitest full svit, körning 2 via `npm run verify:release`
- ESLint
- Production build
- Playwright browser smoke
- `git diff --check`
- PWA/dist-kontrakt
- Modulepreload-kontrakt

## Browserresultat

Playwright kör Chromium i desktop- och mobilviewport.

Verifierade flöden:

- Appstart utan console errors, runtime errors eller lokala 4xx/5xx-regressioner.
- Loginvy och registreringstoggle renderas.
- Lokal onboarding kan öppna centrala appytor när auth inte blockerar.
- AI Coach, Reminder Center och Goals & Habits syns i appflödet.
- PWA manifest, service worker och ikoner serveras från production preview.
- Offline reload fungerar efter första besök när app-assets har cachevärmts.
- Tunga lazy chunks som `CloudBackupPanel`, `ReminderCenter`, `LaunchReadinessPanel` och `ReportDrilldown` modulepreloadas inte initialt.

## Hittad release-blocker

Offline-smoke-testet hittade att service workern bypassade `/assets/supabase-vendor-*.js` eftersom bypassregeln matchade ordet `supabase` i filnamnet. Filen låg i cachen men användes inte offline, vilket gjorde att React-runtime aldrig startade vid offline reload.

Åtgärd: `/assets/...` undantas nu från API/auth-bypass innan Supabase/API-reglerna utvärderas.

## Återstående manuella kontroller

- Riktig Supabase login/logout med testkonto.
- Riktig registrering med e-postflöde.
- Cloud Backup/Restore mot Supabase.
- Cross-tab sync och leader takeover med verklig molnstatus.
- Service Worker update mellan två deployade versioner.
- Lighthouse PWA-kontroll i Chrome DevTools.

Se `docs/manual-release-acceptance-v1.md` för stegvis acceptance-guide och `docs/manual-release-acceptance-template.json` för anonymiserad rapportmall.

## Release-status

Automatiserad releasevalidering är avsedd att köras med:

```bash
npm run verify:release
```

Scriptet skriver `docs/release-report.json` när hela gaten passerar.

DEP0190-varningen från Windows-körning är borttagen genom att release-scriptet startar `npm.cmd` direkt i stället för att använda `spawnSync(..., shell: true)`.
