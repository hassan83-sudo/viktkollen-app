# Testjämförelse för AI-kundtjänst

Bas: isolerad worktree på 8a9597d (före 7dbe726). Samma låsfil/runtime, förutom kandidatens nya testberoende PGlite. Båda körningarna använder mockade tjänster; inga produktionshemligheter.

| Körning | Godkända tester | Misslyckade tester |
| --- | ---: | ---: |
| Ursprung | 5051 | 71 |
| Arbetsgren | 5089 | 68 |

Jämförelsen identifierar tester via relativ fil och fullständigt testnamn, inte enbart antal. Suite-laddningsfel redovisas separat genom sin fil. En skillnad är en kandidat för regression eller timingfel och behöver bedömas.

## Nya misslyckanden

- Inga.

## Upphörda misslyckanden

- api/_shared/billing/providers/sumup.test.js — BILL-10A SumUp adapter keeps the adapter server-only and fails closed without credentials
- api/ai/vkRouteDispatch.test.js — AI route dispatch on /api/ai keeps the deployable serverless function count at or below the Hobby limit
- src/services/billing/billingKillSwitch.5b3c.test.js — BILL-5B3C admin kill switches does not add a new API route and keeps 11 deployable functions
- tests/ai-help/ai-coach-panel.spec.js — suite load failure
- tests/ai-help/ai-help-panel.spec.js — suite load failure

## Kvar från ursprunget

- api/_shared/billing/paymentProviderFoundation.test.js — BILL-9A trusted provider events activates only the checkout intent user and plan, then replays safely
- scripts/publicTableMigrationGuard.test.js — SUPABASE-30OCT-C1 public table migration guard ignores billing tables and the B4 hardening migration
- src/components/AiCoachOverlay.test.jsx — AI Coach tap me and realtime voice security opens AI Coach from Dagens läge mood card on Home
- src/components/AiCoachOverlay.test.jsx — AI Coach tap me and realtime voice security scopes new AI Coach styling to ai-coach-specific selectors and leaves Redo CSS untouched
- src/components/BodyAnalysisUploader.test.jsx — BodyAnalysisUploader marks all three body scan angles complete and enables analysis when photos exist
- src/components/BodyAnalysisUploader.test.jsx — BodyAnalysisUploader renders readable step states, capture target and camera controls
- src/components/BodyAnalysisUploader.test.jsx — BodyAnalysisUploader scrolls to the camera capture area when a step is pressed
- src/components/ChatInput.test.jsx — ChatInput voice conversation UI keeps manual text input available when voice is unsupported
- src/components/ChatInput.test.jsx — ChatInput voice conversation UI renders a keyboard-native conversation stop control and AI voice controls
- src/components/a11y/confirmDialog.test.jsx — ConfirmDialog (8M B13) browser dialog zero-gate: window.confirm only in Molnbackup (Cursor, exactly 4), nowhere else
- src/components/app/HomeFoodScanRouting.test.js — Home Matscanning routing routes the Smart Camera food adapter to the real onScanFood callback too
- src/components/app/OverviewDashboard.test.jsx — OverviewDashboard starts Home compact with live info and a fixed profile circle
- src/components/app/appShell.test.jsx — Performance Architecture app shell components renders the approved main navigation with Social Room next to More
- src/components/app/scrollArchitecture.test.js — app scroll architecture keeps bottom navigation reachable without owning page scroll
- src/components/sections/PlaceSection.test.jsx — PlaceSection closes the Allt är okej modal automatically if consent is revoked
- src/components/sections/PlaceSection.test.jsx — PlaceSection closes the Platshistorik modal automatically if consent is revoked
- src/components/sections/PlaceSection.test.jsx — PlaceSection closes the Platsnotiser modal automatically if consent is revoked
- src/components/sections/PlaceSection.test.jsx — PlaceSection closes the SOS modal automatically if consent is revoked
- src/components/sections/PlaceSection.test.jsx — PlaceSection describes Inställningar för platsdelning truthfully, without claiming real GPS or family sharing is active
- src/components/sections/PlaceSection.test.jsx — PlaceSection keeps SOS disabled and honest
- src/components/sections/PlaceSection.test.jsx — PlaceSection makes Allt är okej openable with consent, without changing the six earlier openable cards
- src/components/sections/PlaceSection.test.jsx — PlaceSection makes Batterisnålt läge openable with consent, without changing the eight earlier openable cards
- src/components/sections/PlaceSection.test.jsx — PlaceSection makes Inställningar för platsdelning openable with consent, without changing the nine earlier openable cards
- src/components/sections/PlaceSection.test.jsx — PlaceSection makes Platshistorik openable with consent, without changing the seven earlier openable cards
- src/components/sections/PlaceSection.test.jsx — PlaceSection makes Platsnotiser openable only after consent, without changing earlier Plats cards
- src/components/sections/PlaceSection.test.jsx — PlaceSection makes SOS openable only after consent, without changing earlier Plats cards
- src/components/sections/PlaceSection.test.jsx — PlaceSection shows an honest empty state for Barnets plats with no fabricated position, time or battery level
- src/components/sections/PlaceSection.test.jsx — PlaceSection shows an honest empty state for Familjekarta with no fabricated position, person or time
- src/components/sections/PlaceSection.test.jsx — PlaceSection shows an honest empty state for Platshistorik with no fabricated history and no tracking, storage or backend introduced
- src/components/sections/PlaceSection.test.jsx — PlaceSection shows an honest empty state for Platsnotiser with no fabricated events, people or times
- src/components/sections/PlaceSection.test.jsx — PlaceSection shows an honest empty state for Trygga platser with no fabricated address, coordinate or radius
- src/components/sections/PlaceSection.test.jsx — PlaceSection shows an honest not-connected SOS status with the 112 fallback and no fabricated dispatch
- src/components/sections/PlaceSection.test.jsx — PlaceSection shows an honest not-yet-connected check-in with no fabricated recipient, time or position
- src/components/sections/PlaceSection.test.jsx — PlaceSection shows the real sharingEnabled status in the sharing settings modal, on and off, with no fake toggle or recipient
- src/components/sections/ReadySection.test.jsx — Ready! section wiring keeps the Fortsätt button on one line by giving the forgot-card form its own grid columns
- src/components/sections/ReadySection.test.jsx — Ready! section wiring routes the Ready AI Eye shortcut to the existing forgotten-items camera flow
- src/features/smart-camera/components/SmartCameraHub.test.jsx — SmartCameraHub keeps Smart Camera usable without Eyes, Mouth or Memory
- src/features/smart-camera/components/SmartCameraHub.test.jsx — SmartCameraHub renders compact modes and hides Family Safety
- src/features/smart-camera/smartCameraSecurity.test.jsx — Smart Camera security opens Mina ta-med-listor from Mer without the old Get Ready checklists
- src/features/social/components/SocialRoom.test.jsx — SocialRoom switches internal views and retains local player preferences without autoplay
- src/pwa.test.js — PWA V2 contract keeps install, update, offline and diagnostics UI accessible
- src/pwa.test.js — PWA V2 contract registers and watches the service worker in production when supported
- src/pwa.test.js — PWA V2 contract separates service worker caches and avoids dynamic data
- src/services/bodyAnalysisGuidedScan.test.js — bodyAnalysisGuidedScan defines the guided front, side and back scan steps
- src/services/bodyAnalysisGuidedScan.test.js — bodyAnalysisGuidedScan matches before and after photos by angle only when both scans have that angle
- src/services/bodyAnalysisGuidedScan.test.js — bodyAnalysisGuidedScan selects an angle, records photos in the right slot, and retakes one angle only
- src/services/bodyAnalysisGuidedScan.test.js — bodyAnalysisGuidedScan walks front to side to back and requires all angles before completion
- src/services/bodyAnalysisHistory.test.js — bodyAnalysisHistory privacy normalizes older history entries to the current schema safely
- src/services/mealAnalysisService.test.js — mealAnalysisService sends the current Supabase access token to the endpoint
- src/services/navigation/appSections.test.js — appSections exposes Hem, Redo!, Plats, Notis, Stället and Mer in bottom nav order
- src/services/navigation/appSections.test.js — appSections returns section metadata and indexes
- src/services/nutritionPhotoAnalysisProvider.test.js — nutritionPhotoAnalysisProvider accepts a server response after the previous 12s client timeout
- src/services/nutritionPhotoAnalysisProvider.test.js — nutritionPhotoAnalysisProvider does not call the photo route when session is missing
- src/services/nutritionPhotoAnalysisProvider.test.js — nutritionPhotoAnalysisProvider ignores remote result after user switch
- src/services/nutritionPhotoAnalysisProvider.test.js — nutritionPhotoAnalysisProvider keeps HTTP 502 provider failures distinct from aborted requests
- src/services/nutritionPhotoAnalysisProvider.test.js — nutritionPhotoAnalysisProvider lets a server 504 after 45s reach the client without client abort
- src/services/nutritionPhotoAnalysisProvider.test.js — nutritionPhotoAnalysisProvider posts remote analysis to the secure server route as multipart form data
- src/services/nutritionPhotoAnalysisProvider.test.js — nutritionPhotoAnalysisProvider reports client timeout as the abort source
- src/services/nutritionPhotoAnalysisProvider.test.js — nutritionPhotoAnalysisProvider reports upstream component cleanup as the abort source
- src/services/nutritionPhotoAnalysisProvider.test.js — nutritionPhotoAnalysisProvider surfaces missing remote route without automatic local fallback
- src/services/nutritionPhotoAnalysisProvider.test.js — nutritionPhotoAnalysisProvider surfaces provider or network failure without leaving the caller waiting
- src/services/nutritionPhotoAnalysisProvider.test.js — nutritionPhotoAnalysisProvider surfaces rate limit without automatic local fallback
- src/services/nutritionPhotoAnalysisProvider.test.js — nutritionPhotoAnalysisProvider surfaces remote server failure without automatic local fallback
- src/services/progressWeightFlow.test.js — weight module regression flow monthly report uses the same 30-day daily weight change as weight analysis
- src/services/progressWeightFlow.test.js — weight module regression flow reports avoid NaN and misleading direction text when period weight data is insufficient
- src/services/security/barcodeCameraNoNetwork.test.js — barcode scanner camera frames stay local stopBarcodeScanner only stops local camera tracks and never calls a network primitive
- src/services/vercelSecurityHeaders.test.js — Vercel security headers is valid JSON with a catch-all header source
- src/viteConfigDevApi.test.js — vite dev nutrition photo route middleware keeps Cloudflare tunnel hosts scoped and avoids allowing every host
