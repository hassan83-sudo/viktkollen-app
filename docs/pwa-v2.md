# PWA V2

PWA V2 gör Viktkollen mer produktionsredo utan att ändra affärslogik, Supabase Auth, Cloud Backup/Restore eller användardataformat.

## Arkitektur

- `public/manifest.webmanifest` beskriver den installerbara appen.
- `public/sw.js` hanterar offline app-shell, statiska assets, ikoner och uppdateringar.
- `src/registerServiceWorker.js` innehåller registrering, update-detektion och `skipWaiting`-hjälpare.
- `src/components/PwaExperience.jsx` visar installation, offline-status, uppdateringsbanner och devdiagnostik.
- `src/App.jsx` renderar PWA-upplevelsen globalt och lazy-loadar tunga sektioner.

## Installationsflöde

Appen lyssnar på `beforeinstallprompt`, stoppar webbläsarens prompt tillfälligt och visar en egen knapp: `Installera appen`.

Knappen döljs när:

- appen redan körs i standalone/fullscreen
- `appinstalled` har körts
- webbläsaren inte erbjuder installation

Om användaren avbryter installationen visas en neutral status och inget fel kastas.

## Uppdateringsflöde

Service worker-registreringen bevakar `updatefound` och väntande workers. När en ny worker är installerad visas bannern `Ny version finns`.

Knappen `Uppdatera nu` skickar:

```js
{ type: 'SKIP_WAITING' }
```

till väntande service worker. När `controllerchange` kommer laddas sidan om säkert. Användardata ligger kvar i befintlig storage och ändras inte av uppdateringsflödet.

## Offlineflöde

Appen lyssnar på `online` och `offline`. Vid offline visas en banner med tydlig text och statuspill ändras till `Offline`.

Offline innebär:

- tidigare besökt app-shell kan öppnas
- statiska assets och ikoner kan komma från cache
- nätberoende funktioner får vänta på anslutning

Appen ska inte visa tekniska nätfel bara för att användaren är offline.

## Cache-Strategi

Service workern använder version `v2` och tre separata cacher:

- `viktkollen-app-shell-v2`
- `viktkollen-assets-v2`
- `viktkollen-images-v2`

Strategier:

- Navigering: network-first med fallback till cachad `/index.html`.
- Vite-assets: stale-while-revalidate.
- Bilder och ikoner: stale-while-revalidate.
- Activate: tar bort äldre `viktkollen-*` cacher som inte ingår i aktuell version.

## Det Som Inte Cachas

Service workern bypassar:

- externa origins
- `/api/`
- sökvägar som innehåller `/auth`
- sökvägar som innehåller `/supabase`
- sökvägar som innehåller `/openai`

Den cachar inte localStorage, IndexedDB, auth-token, Supabase-data, Cloud Backup-data, AI-anrop eller dynamisk användardata.

## Utvecklarpanel

`PwaExperience` visar en liten `PWA diagnostics`-panel endast i development. Den visar:

- service worker-status
- cacheversion
- installerad: ja/nej
- online/offline
- om ny version finns
- appversion

Panelen renderas inte i production.

## Performance

Flera stora paneler laddas nu med `React.lazy`:

- AI Coach-rapport
- streckkodsskanner
- Cloud Backup-panel
- Måltidscenter
- månadsrapport
- framstegscenter
- Smart Progress Dashboard
- framstegsbilder
- påminnelser

Det minskar initial bundle och låter Vite skapa separata chunks. Funktionaliteten är densamma när panelerna har laddats.

## Begränsningar

- Ingen push-notis.
- Ingen background sync.
- Ingen egen avancerad uppdateringsdialog.
- Ingen offline-sida utöver app-shell fallback.
- iOS-installation sker fortsatt via Safari och "Lägg till på hemskärmen".

## Testa Manuellt

1. Kör `npm run build`.
2. Kör `npm run preview`.
3. Öppna Chrome eller Edge.
4. Kontrollera DevTools > Application > Manifest.
5. Kontrollera Service Workers och Cache Storage.
6. Testa installation via egen knapp om webbläsaren erbjuder prompt.
7. Testa offline via DevTools > Network > Offline och ladda om appen.
8. Testa update flow genom att bygga om, öppna appen igen och kontrollera bannern när ny worker väntar.

## PWA V3-Ideer

- professionella appikoner
- separat offline-sida
- app shortcuts
- tydligare update release notes
- Lighthouse-budgetar i CI
- selektiv prefetch när appen är idle
- background sync först efter separat säkerhetsgenomgång
