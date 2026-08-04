# Manual Release Acceptance V2

## Syfte

Manual Release Acceptance V2 ar den sista produktionsnara granskningen for floden som inte kan bevisas fullt ut med lokal automation. Guiden ska koras med dedikerade testkonton, syntetisk data och en staging- eller produktionslik deployment.

Inga credentials, tokens, sessionsvarden, ra Supabase-payloads, ra localStorage, privata bilder eller riktig halsodata far sparas i repo eller rapport.

## Forberedelser

1. Kor `npm run verify:release` lokalt.
2. Kontrollera att working tree inte innehaller screenshots, traces eller testartefakter.
3. Anvand Test User A och Test User B med separata testkonton.
4. Anvand syntetisk testdata:
   - fiktiv vikt
   - fiktiva maltider
   - fiktiva check-ins
   - fiktiva mal/vanor
   - fiktiva reminders
   - fiktiva coach actions
5. Dokumentera endast anonymiserade ids, till exempel `<user-a-prefix>`.

## Miljo

Verifiera endast `configured` eller `not_configured`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- server-side `OPENAI_API_KEY` om nutrition photo route ar releasekrav
- nutrition photo route config
- Vercel deployment URL
- HTTPS
- PWA scope
- Supabase redirect URLs
- Supabase RLS policies
- backup-tabell
- sync-tabell

## Testmatris

Status per kontroll: `passed`, `failed`, `not_tested`, `blocked`.

### 1. Real Supabase Auth

- registrering
- e-postbekraftelse om aktiverad
- login
- fel losenord
- okand anvandare
- session refresh
- reload
- ny browserflik
- installerad PWA
- logout
- login igen
- logout under sync, backup, restore, import, export, nutrition analysis, reminder och social preview

Forvantat: ingen evig auth-loading, inga tokens i console/diagnostics, ingen tidigare anvandares data efter logout.

### 2. RLS och User Isolation

- Test User A ser endast A:s backup och sync-items.
- Test User B ser endast B:s backup och sync-items.
- A kan inte lasa, skriva, restore:a eller losa konflikter for B.
- User switch i samma browser visar inte gammal snapshot, queue, reminders eller conflicts.

Forvantat: ingen cross-user data. Vid cross-user access ar release `NOT READY`.

### 3. Cloud Sync V3 Multi-device

Kor med tva enheter eller helt separata browserprofiler:

- maltid A -> B
- vikt B -> A
- reminder A -> B
- mal/vana B -> A
- coach action A -> B
- device registry, last seen, dirty keys, queue och sync health

Forvantat: inga dubbletter, inga silent overwrites, inga falska success.

### 4. Konflikt

1. Gor bada enheter offline.
2. Andra samma objekt pa A och B.
3. Ga online pa A.
4. Ga online pa B.
5. Verifiera conflict detection.
6. Testa local wins, remote wins, safe merge, manual conflict, avbryt och resolve later.

Forvantat: konflikt forsvinner inte tyst och samma status visas i Cloud Sync och Sync Health.

### 5. Cross-tab Coordination

- en leader och en follower
- follower dirty signal
- manuell sync fran follower
- leader stangs
- takeover
- stale lease
- sleep/wake
- offline/online
- inga dubbla uploads/retries/notifications

### 6. Cloud Backup och Restore

- skapa representativ testdata
- skapa backup
- skapa ny backup
- kontrollera latest backup
- verifiera inga auth/sessioner, bilder eller base64
- restore efter lokal andring
- restore pa ny enhet
- restore offline/pending sync/conflict
- snapshot/rollback

### 7. Import och Export V2

Import:

- aktuell backup JSON
- CSV meals, weight och check-ins
- invalid/oversized/formula injection
- preview, append, safe merge, replace confirmation, skip, duplicate, cancel, rollback

Export:

- full backup
- selective backup
- CSV exports
- preview och verification
- roundtrip via Import V2
- offline export
- kontrollera forbjudna monster: token, session, password, authorization, Supabase session, base64, blob, diagnostics, raw provider response, API key

### 8. Nutrition Photo Route

Kor med syntetisk matbild utan persondata:

- samtycke fore request
- JPEG/PNG/WebP om stods
- invalid MIME
- for stor fil
- timeout, abort, rate limit, provider unavailable
- review, manuell redigering, ingredient matching, save, duplicate, cleanup

Forvantat: ingen API-nyckel i klienten och ingen bild i storage, sync, backup, export, logs eller diagnostics.

### 9. Notifications V3

- permission allow/deny/default
- in-app banner
- systemnotis
- quiet hours
- batching
- snooze, skip, complete
- archive/restore
- reload/offline
- tva flikar
- logout/user switch

Forvantat: ingen dubbelnotis, ingen notis efter logout och ingen kanslig systemnotis.

### 10. PWA

- install prompt
- standalone mode
- ratt namn/ikon
- manifest/sw
- offline shell och reload
- online igen
- lazy chunks
- update banner och skip waiting
- sparad data kvar

### 11. Feature Reachability

Verifiera desktop och mobil:

- Health Dashboard
- Adaptive Coach
- Goals & Habits
- Nutrition Scanner
- Reminder Center
- Notification Center
- Insights Center
- Achievement Center
- Social Center
- Data Import Center
- Data Export Center
- Cloud Backup
- Cloud Sync
- Sync Health Dashboard
- Weekly Report
- Monthly Report
- Launch Readiness i development

### 12. Social Privacy

- friend model
- invite
- accountability partner
- share preview
- anonymisering
- private/shared/public
- local share token
- leaderboard default off, opt-in och opt-out
- user switch
- export

Forvantat: ingen backend-sharing om backend saknas, ingen medicinsk data, ingen kroppsjämförelse, ingen social data fran annan anvandare.

### 13. Achievements

- unlock
- duplicate prevention
- XP och level
- milestone
- challenge start/complete/skip
- missed day och recovery streak
- notification
- sync
- import/export
- backup/restore
- user switch

Forvantat: ingen dubbel XP, ingen skuldbelaggning och ingen extrem halsoutmaning.

### 14. Dashboard, Coach och Reports

Verifiera att samma testdata ger konsekventa fakta i:

- Health Dashboard
- Adaptive Coach
- Weekly Report
- Monthly Report
- Insights
- Achievements
- Social
- Notifications

Forvantat: inga `NaN`, `undefined`, ra tekniska varden eller motsagelser.

### 15. Accessibility och Console/Network

- keyboard: Tab, Shift+Tab, Enter, Space, Escape
- fokusretur
- file inputs
- modal/region/accordion
- aria-live, aria-expanded, aria-controls, aria-invalid, aria-describedby
- progressbar och chart descriptions
- reduced motion
- mobile touch targets
- console errors/warnings
- failed requests
- retry loops
- stora payloads
- secrets

## Resultatklassning

- `blocker`: data leakage, cross-user access, data loss, auth blocker, restore blocker, silent overwrite, exposed secret, production crash
- `high`: tydlig release-risk utan workaround
- `medium`: risk med workaround
- `low`: mindre problem
- `accepted_limitation`: dokumenterad begransning
- `documentation_only`: endast dokumentation

## Releasebeslut

READY:

- inga blocker/high
- RLS, auth, sync, backup/restore, PWA och user isolation verifierade

CONDITIONAL:

- automation ar gron
- inga dataforlustblockerare
- externa miljokontroller kvar

NOT READY:

- data leakage
- cross-user access
- data loss
- auth blocker
- restore blocker
- silent sync overwrite
- exposed secret
- production crash

## Staging Enablement

Anvand dessa hjalpmedel innan den riktiga externa passningen:

- `npm run validate:staging`
- `npm run verify:photo-route`
- `npm run verify:preview -- https://preview-url`
- `supabase/release_acceptance_checks.sql`
- `docs/staging-real-acceptance-enablement-v1.md`
- `docs/staging-setup-checklist-v1.md`
- `docs/two-user-two-device-test-guide-v1.md`
- `docs/test-data-cleanup-guide-v1.md`

Hjalpmedlen rapporterar endast sakra statusar. De markerar inte riktig Supabase, RLS, multi-device, notification, photo-provider eller Vercel som manuellt verifierade.

## Release Candidate V1

Nar staging enablement ar pa plats, anvand:

- `docs/release-candidate-v1.md`
- `docs/release-candidate-user-runbook-v1.md`
- `docs/release-candidate-v1-result.json`

RC V1 ar `CONDITIONAL` tills Test User A/B, RLS, multi-device, backup/restore, notifications, PWA och eventuell photo-provider ar verifierade i riktig staging/preview.
