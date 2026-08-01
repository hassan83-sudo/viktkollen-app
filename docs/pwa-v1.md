# PWA V1

Viktkollen är nu förberedd för installation som PWA i moderna Chromium-baserade webbläsare och har ett försiktigt offline-stöd för tidigare besökt app-shell.

## Filer

- `public/manifest.webmanifest`: PWA-manifest för Viktkollen.
- `public/sw.js`: enkel service worker för app-shell och statiska appresurser.
- `public/pwa-icon-192.png`: appikon 192x192.
- `public/pwa-icon-512.png`: appikon 512x512.
- `public/pwa-maskable-512.png`: maskable appikon 512x512.
- `src/registerServiceWorker.js`: produktionssäker registrering.
- `src/main.jsx`: registrerar service workern via hjälpfunktionen.
- `index.html`: länkar manifest, theme-color och Apple metadata.
- `src/pwa.test.js`: kontraktstester för manifest, service worker och registrering.

## Manifest

Manifestet använder:

- `name` och `short_name`: Viktkollen
- `lang`: `sv`
- `display`: `standalone`
- `start_url` och `scope`: `/`
- `orientation`: `portrait`
- `theme_color`: `#168b9c`
- `background_color`: `#eaf0f6`

Ikonerna är lokala PNG-filer och manifestet använder inga externa bildlänkar.

## Service Worker

`public/sw.js` använder två versionerade cacher:

- `viktkollen-app-shell-v1` för app-shell, manifest och ikoner.
- `viktkollen-static-v1` för statiska appresurser från samma origin, främst Vite-byggda `/assets/`.

Vid `activate` tas gamla cacher bort. Service workern använder `skipWaiting()` och `clients.claim()` så en ny build inte ska fastna permanent bakom en gammal worker.

Navigeringar försöker först gå mot nätverket. Om användaren är offline faller de tillbaka till cachad `/index.html` eller `/`.

## Det Som Inte Cachas

Service workern cachar inte:

- externa förfrågningar
- `/api/`
- Supabase-förfrågningar
- autentisering
- AI-anrop
- Cloud Sync eller Cloud Backup-data
- localStorage-data
- dynamisk användardata

All användardata fortsätter hanteras av befintliga appflöden.

## Testa Installation I Chrome Och Edge

1. Kör `npm run build`.
2. Kör en statisk server mot `dist`, till exempel `npm run preview`.
3. Öppna appen i Chrome eller Edge.
4. Kontrollera DevTools > Application > Manifest.
5. Kontrollera att webbläsaren erbjuder installation via adressfältet eller appmenyn.

## Testa Offline Lokalt

1. Kör `npm run build`.
2. Kör `npm run preview`.
3. Öppna appen och navigera en gång så service workern hinner installeras.
4. Gå till DevTools > Application > Service Workers och markera Offline, eller stäng nätverket.
5. Ladda om sidan. Tidigare besökt app-shell ska öppnas.

## iPhone Och iOS

iOS stödjer installation via Safari och "Lägg till på hemskärmen", men installationsflödet är mer begränsat än Chrome/Edge. Pushnotiser, background sync och egen installationsknapp ingår inte i PWA V1.

## Avregistrera Under Utveckling

I DevTools:

1. Application > Service Workers > Unregister.
2. Application > Storage > Clear site data.
3. Ladda om sidan.

Eftersom registrering endast sker i production ska normal `npm run dev` inte installera service workern.

## Ikoner

Ikonerna i PWA V1 är lokala placeholders med Viktkollens befintliga färgtema. De bör ersättas av professionella produktikoner i en senare designrunda.

## PWA V2

Möjliga nästa steg:

- bättre uppdateringsflöde när ny version finns
- separat offline-sida
- mer detaljerad Lighthouse-verifiering
- professionella appikoner
- optional app shortcuts
- eventuell background sync först efter separat säkerhetsgenomgång
