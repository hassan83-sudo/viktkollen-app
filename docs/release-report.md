# Release Report

Status: redo for release-gate efter automatiserad verifiering.

## Senaste release-gate

Release Validation V1 etablerar ett repeterbart release-gate for Viktkollen som release candidate. Kontrollerna kors mot production build och production preview.

## Automatiserade kontroller

- Vitest full svit, korning 1
- Vitest full svit, korning 2 via `npm run verify:release`
- ESLint
- Production build
- Playwright browser smoke
- `git diff --check`
- PWA/dist-kontrakt
- Modulepreload-kontrakt

## Browserresultat

Playwright kor Chromium i desktop- och mobilviewport.

Verifierade floden:

- Appstart utan console errors, runtime errors eller lokala 4xx/5xx-regressioner.
- Loginvy och registreringstoggle renderas.
- Lokal onboarding kan oppna centrala appytor nar auth inte blockerar.
- AI Coach, Reminder Center och Goals & Habits syns i appflodet.
- Lazy feature centers verifieras efter lokal onboarding: Data Import, Data Export, Sync Health, Insights, Achievement Center, Social Center, Notification Center och Cloud Backup.
- PWA manifest, service worker och ikoner serveras fran production preview.
- Offline reload fungerar efter forsta besok nar app-assets har cachevarmts.
- Tunga lazy chunks som `CloudBackupPanel`, `ReminderCenter`, `LaunchReadinessPanel`, `DataImportCenter`, `DataExportCenter`, `AchievementCenter`, `SocialCenter` och `ReportDrilldown` modulepreloadas inte initialt.

## Hittad release-blocker

Offline-smoke-testet hittade tidigare att service workern bypassade `/assets/supabase-vendor-*.js` eftersom bypassregeln matchade ordet `supabase` i filnamnet. Filen lag i cachen men anvandes inte offline, vilket gjorde att React-runtime aldrig startade vid offline reload.

Atgard: `/assets/...` undantas nu fran API/auth-bypass innan Supabase/API-reglerna utvarderas.

## Aterstaende manuella kontroller

- Riktig Supabase login/logout med testkonto.
- Riktig registrering med e-postflode.
- Cloud Backup/Restore mot Supabase.
- Cross-tab sync och leader takeover med verklig molnstatus.
- Service Worker update mellan tva deployade versioner.
- Nutrition photo route med korrekt production-config.
- Notifications pa desktop och installerad PWA.
- Social privacy och opt-in leaderboard.
- Lighthouse PWA-kontroll i Chrome DevTools.

Se `docs/manual-release-acceptance-v1.md` for stegvis acceptance-guide och `docs/manual-release-acceptance-template.json` for anonymiserad rapportmall.

## Manual Release Acceptance V2

`docs/manual-release-acceptance-v2.md` ar skapad for den sista externa acceptance-korningen med Test User A och Test User B. Aktuellt V2-resultat ar CONDITIONAL eftersom riktig Supabase, RLS, multi-device sync, backup/restore, notifications, nutrition photo route och Vercel acceptance inte kan bevisas i lokal Codex-session utan externa testkonton och deployment.

## Release-status

Automatiserad releasevalidering ar avsedd att koras med:

```bash
npm run verify:release
```

Scriptet skriver `docs/release-report.json` nar hela gaten passerar.
