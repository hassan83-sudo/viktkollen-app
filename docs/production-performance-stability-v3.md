# Production Performance & Stability V3

## Startläge

- Branch: `main`
- Senaste commit vid sprintstart: `dd9e28a Add predictive health intelligence and forecasting`
- Arbetskatalog: ren vid start
- Build-baslinje: `npm run build` passerade
- Initial index chunk: cirka 181,54 kB
- Största initiala/vendor chunks: `supabase-vendor` cirka 205,69 kB, `react-vendor` cirka 189,63 kB
- Större lazy/service chunks: `nutritionEngine` cirka 86,27 kB, `MealLogger` cirka 73,61 kB, `aiCoachDeterministicReplies` cirka 66,88 kB, `insightsEngine` cirka 44,71 kB

## Verifierade Hotspots

Samma shared analytics-modell byggdes från flera ställen:

- Health Dashboard
- Weekly Report
- Monthly Report
- Insights Center
- Nutrition Coach
- Prediction Center

Det är samma centrala modell, men den kunde köras flera gånger under samma render-/rapportflöde.

## Fixar

### Sessionsbaserad Shared Analytics Cache

`sharedAnalyticsEngine` har nu en liten LRU-cache:

- Max 24 entries
- Endast i minnet
- Ingen service worker-cache
- Ingen storage key
- Ingen persistent data
- Cache key består av datum, period och hashad inputfingerprint
- Rensas vid app-state reload, signin, signup och signout

Syftet är att återanvända samma tunga analys inom samma session utan att riskera cross-user data.

### Chunk Load Recovery

`AppErrorBoundary` känner nu igen lazy/chunk-load-fel via `appErrorService`.

Recovery-regler:

- Högst en kontrollerad reload per appversion och session
- Ingen localStorage-rensning
- Ingen auth-rensning
- Säker svensk fallback om recovery inte löser problemet
- Ingen stack trace i production

### Performance Diagnostics

`performanceDiagnostics` bygger read-only sammanfattning för Launch Readiness:

- analytics cache size
- cache version
- app version
- lazy chunk count
- största lazy chunks
- listener-kategorier
- scheduler-typer
- online/visibility
- storage size bands

Den visar inte användardata, exakta storagevärden, tokens, e-post, prompts eller provider responses.

## Lazy Boundary Audit

Kontrollerade lazy center-vyer:

- AdaptiveCoachPanel
- CoachPlanCenter
- NutritionCoachCenter
- PredictionCenter
- NutritionScannerV2
- DataImportCenter
- DataExportCenter
- AchievementCenter
- SocialCenter
- NotificationCenter
- InsightsCenter
- SyncHealthDashboard
- CloudBackupPanel
- ReminderCenter
- ManualAcceptanceRunner

Release-gaten kontrollerar att förbjudna center-vyer inte modulepreloadas.

## Service Worker

`public/sw.js` granskades:

- `/assets/` får cacheas för app shell
- `/api/`, auth, Supabase och OpenAI bypassar cache
- Navigation fallback använder app shell offline
- Gamla cacheversioner rensas vid activate
- `SKIP_WAITING` stöds

Ingen ändring behövdes i denna sprint.

## Bundle Efter Fix

Efter sprinten:

- Initial index chunk ökade marginellt på grund av cache/recovery/diagnostics-kod
- Lazy center-kontraktet är oförändrat
- PWA-filer finns kvar i `dist`

## Kända Begränsningar

- Cache invalidation är konservativ och bygger på hashad sammanfattning av centrala inputfält.
- Runtime diagnostics visar band och kategorier, inte realtidsprofilering med Performance API.
- Chunk recovery gör en kontrollerad reload, men kan inte garantera återhämtning om nätet är offline och chunk saknas i cache.
