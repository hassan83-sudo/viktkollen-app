# Staging & Real Acceptance Enablement V1

Syftet ar att gora Viktkollen redo for riktig Manual Release Acceptance V2 i staging eller production preview. Den har filen intygar inte att externa tester ar korda. Den beskriver lokala skydd, scripts och guider.

## Nulage

- Supabase Auth anvands via `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY`.
- Cloud Backup/Restore anvander befintlig Cloud Sync/backup-arkitektur.
- Nutrition photo route finns i `api/nutrition-photo-analysis/index.js` och kraver `OPENAI_API_KEY` server-side for riktig provider.
- PWA-filer finns i `public/manifest.webmanifest`, `public/sw.js` och PWA-ikonerna.
- Release-gate kor unit tests, lint, build, Playwright smoke, diff-check och dist/PWA-kontrakt.

## Nya enablement-delar

- `npm run validate:staging` kontrollerar stagingkonfiguration utan att skriva ut varden.
- `npm run verify:photo-route` kontrollerar route-kontrakt lokalt och hoppar over remote utan URL.
- `npm run verify:preview -- https://preview-url` verifierar preview-kontrakt utan credentials.
- `supabase/release_acceptance_checks.sql` ger read-only SQL-checks for RLS, tabeller, policies och index.
- `ManualAcceptanceRunner` ar lazy-loaded och endast tillganglig i development.
- `releaseAcceptanceFixtures` kan skapa och rensa markerad `TESTDATA_RELEASE_ACCEPTANCE_V1`.

## Resultatstatusar

- `automatedPass`: lokalt script eller test har passerat.
- `manuallyVerified`: endast anvandaren far markera detta efter verkligt externt test.
- `blockedByEnvironment`: testet kraver konto, enhet, deployment eller provider som saknas.
- `failed`: verifierat fel.
- `notRun`: inte kort.
- `acceptedLimitation`: medvetet accepterad begransning.

## Sakerhetsregler

- Inga nycklar, tokens, losenord eller testkonton ska skrivas in i repo.
- Validators far bara visa `PASS`, `FAIL`, `SKIP`, variabelnamn och saker forklaring.
- Fixtures kors aldrig automatiskt och ar sparrade i production.
- Cleanup tar endast bort objekt med explicit TESTDATA-marker.
- Supabase SQL-filen ar read-only som standard.

## Manuella steg

1. Skapa Test User A och Test User B i staging/preview.
2. Kor `npm run validate:staging` i konfigurerad miljo.
3. Kor SQL-checks i Supabase SQL Editor.
4. Folj tva-konto/tva-enhets-guiden.
5. Kor backup/restore, sync conflict, notification, PWA och photo route enligt acceptance-guiden.
6. Spara sakra resultat fran ManualAcceptanceRunner eller JSON-resultatmallen.

Release-status forblir `CONDITIONAL` tills de externa stegen ar manuellt verifierade.
