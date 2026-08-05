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

## Staging & Real Acceptance Enablement V1

- Staging validator, preview verifier, photo route preflight och read-only Supabase checks ar tillagda.
- Deterministiska development-only TESTDATA fixtures och ManualAcceptanceRunner ar tillagda.
- Release-status forblir CONDITIONAL tills anvandaren kor riktig extern Manual Release Acceptance V2.

## Release Candidate V1

`docs/release-candidate-v1.md` och `docs/release-candidate-user-runbook-v1.md` sammanstaller RC-passningen. Aktuell RC-status ar CONDITIONAL: lokal release-gate ar gron, men real Supabase/RLS, multi-device, backup/restore, notifications, PWA install/update och Vercel preview acceptance aterstar.

## OpenAI Production Integration V1

OpenAI-anrop ar server-side via gemensam gateway. Adaptive Coach ar hybrid: regelbaserade fakta och fallback ar grund, medan remote AI kraver aktivt samtycke och knapptryck. Nutrition photo route ateranvander gatewayen. Release-status forblir CONDITIONAL tills providerconfig, abuse protection och stagingfloden verifierats externt.

## Release-status

Automatiserad releasevalidering ar avsedd att koras med:

```bash
npm run verify:release
```

Scriptet skriver `docs/release-report.json` nar hela gaten passerar.
## AI Route Security V2

AI-routes kraver verifierad Supabase-session, user-scoped process-local rate limit, kortlivad user-scoped dedup och `no-store`. Release-status ar fortsatt conditional tills verklig staging med giltig testsession och server-side OpenAI key verifierats.

## Adaptive Coach Personalization V8

Coach memory ar implementerat som ett sakert, regelbaserat lager under befintlig adaptive coach state. Remote memory ar opt-in och skickar endast minimerad context. Release-status ar fortsatt conditional tills stagingfloden med riktig inloggad testanvandare verifierats.

## Nutrition Coach Engine V2

Meal quality, daily nutrition timeline, nutrition gaps och smart food suggestions ar dokumenterade i `docs/nutrition-coach-engine-v2.md`. Den tidigare Personal Insights-arkitekturen ligger kvar i `docs/ai-nutrition-coach-v2.md`. Nutrition Coach Center ar lazy-loaded och release-gaten kontrollerar att varken panelen eller motorn modulepreloadas initialt.
