# Release Validation V1

## Syfte

Release Validation V1 behandlar Viktkollen som en release candidate. Sprinten lägger inte till produktfunktioner utan skapar browserbaserade smoke-tester och ett repeterbart release-gate.

## Verktyg

- Unit/integration: Vitest
- Browser smoke: Playwright Chromium
- Production preview: `vite preview`
- Release gate: `npm run verify:release`

## Nya kommandon

- `npm run test:e2e`: kör Playwright mot production preview.
- `npm run verify:release`: kör två fulla Vitest-sviter, lint, build, Playwright, diff-check och PWA/dist-kontrakt.

## Browserflöden

Automatiskt smoke-testat:

- Desktop appstart
- Mobile appstart
- Console/pageerror/request health
- Auth entrypoints och registreringstoggle
- Lokal onboarding när auth inte blockerar
- AI Coach, Reminder Center och Goals & Habits som synliga releaseytor när appen är tillgänglig
- Offline reload efter första besök
- Asset-cache innan offline-läge aktiveras, inklusive appens indexchunk och React vendor
- PWA manifest/service worker/icons
- Modulepreload-kontrakt för lazy chunks

Manuell kontroll krävs fortfarande för:

- Riktig login/logout mot Supabase-konto
- Riktig registrering med e-postflöde
- Cloud Backup mot Supabase
- Cloud Restore mot Supabase
- Cross-tab sync med två riktiga flikar och molndata
- Leader takeover under aktiv sync
- Service Worker update mellan två deploys
- Lighthouse-installability i Chrome DevTools

## Console Health

Playwright failar på:

- `console.error`
- `pageerror`
- lokala request failures
- React/preload/module warning-text i console

Undantag: lokal `/api/ai` kan ge 404 i production preview eftersom appen då ska falla tillbaka lokalt utan att kräva en backend under release-smoke.

## Release Gate

Gaten passerar endast om:

- Två Vitest-körningar passerar.
- Lint passerar.
- Production build passerar.
- Browser smoke passerar.
- `git diff --check` passerar.
- PWA-filer finns i `dist`.
- Stora lazy chunks inte modulepreloadas i `dist/index.html`.

## Releasefynd

Offlinevalideringen hittade en PWA-regression där `/assets/supabase-vendor-*.js` felaktigt behandlades som Supabase/API-trafik av service workerns bypassregel. Detta är korrigerat så statiska build-assets kan användas offline medan API-, auth- och molntrafik fortsatt inte cachas.

## Kända begränsningar

Playwright-testen använder inga riktiga Supabase credentials och gör därför inte molnmutationer. Det är medvetet för att undvika att release-gaten kräver externa hemligheter eller produktionsdata.
