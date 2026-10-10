# Lokal kroppsscanning (BODY-SCAN-LOCAL-1)

Status: bakom feature flag `localBodyScan` (av som standard). Produktionsflödet
(Tre bilder → `/api/body-analysis` → OpenAI Vision) är oförändrat.

## Nuvarande flöde (oförändrat)

Hem → Kroppsscanning → `HomeBodyScanStage` → `BodyAnalysisCard` → `BodyScanGuidedCapture`.

| Steg | Bilddata | Var |
| --- | --- | --- |
| Fångst | Bildruta → canvas → JPEG `File` + `toDataURL` preview | `BodyScanGuidedCapture.jsx` |
| Samtycke | SHA-256 av de tre bilderna skickas till consent-endpoint (hash, ej bild) | `analysisConsentProof.js` |
| Analys | Tre JPEG-filer som multipart till `/api/body-analysis` | `bodyAnalysisService.js` |
| Server | Bilderna som data-URL till OpenAI Responses API (`store: false`) | `api/body-analysis`, `bodyAnalysisAi.js` |
| Historik | Resultat **och data-URL-förhandsvisningar** sparas i localStorage (`viktkollen.bodyAnalysis.history.v1`) | `bodyAnalysisHistory.js` |
| Molnsynk/export | Förhandsvisningar tas bort före synk/export (endast filnamn) | `sanitizeBodyAnalysisStorageValue` |
| Loggar | Serverloggar innehåller källa/varaktighet, inte bilder; klientens `safeLogger` maskerar data-URL:er | |

## Ny lokal analys

- Modell: MediaPipe Pose Landmarker **lite** (BlazePose GHUM 3D), Apache-2.0
  enligt Googles modellkort. Avsedd för "3D pose measurements (angles/distances)";
  ej för metrisk djupmätning – därför visas aldrig centimeter.
- Bibliotek: `@mediapipe/tasks-vision` **0.10.35** (exakt pin). Version 1.0.x
  innehåller en inbyggd telemetrisändare till `odml.pa.googleapis.com/v1/log`
  som skickas var 60:e sekund och inte kan stängas av – därför används den inte.
- Modell- och WASM-filer är Vite-assets från egen origin (`/assets/...`),
  laddas lazy endast när det lokala läget öppnas.
- Bildrutan ritas på en canvas i minnet, analyseras, och canvasen nollställs
  direkt. Ingen `toDataURL`/`toBlob`/blob-URL, ingen lagring, inga nätverksanrop.
- Kameran stängs efter sista vyn, vid Avbryt, avmontering, `visibilitychange`
  (dold) och `pagehide`.
- Endast enhetslösa proportioner sparas, efter uttryckligt godkännande, per
  användare i `viktkollen.userData.v1.<storageId>.localBodyScan.v1`. Nyckeln synkas
  inte till molnet och raderas vid kontoradering.
- Jämförelse görs bara mot tidigare godkända värden, och bara om avstånd, vinkel
  och ljus är likvärdiga. Annars: "kan inte bedömas".
- Viktförändring visas endast från användarens registrerade vikt.

## Var gamla kroppsbilder ligger (inventering, BODY-SCAN-LOCAL-2)

| Plats | Innehåller kroppsbilder? |
| --- | --- |
| `viktkollen.bodyAnalysis.history.v1` (localStorage, enhetsglobal) | **Ja** – data-URL-förhandsvisningar per analys |
| `viktkollen.bodyAnalysis.history`, `viktkollen.bodyAnalysis.latest` (äldre format) | **Ja**, om de finns kvar |
| `viktkollen.syncRestoreSnapshots` och `viktkollen.userData.v1.<user>.syncRestoreSnapshots` | **Ja** – råa kopior av historiknycklarna |
| `viktkollen.preRestoreBackup` | Nej – byggs via `sanitizeBackupUserData` |
| Molnsynk, molnbackup, JSON-export, dataexport | Nej – förhandsvisningar tas bort före överföring/export |
| sessionStorage, IndexedDB, Cache Storage | Nej (SW cachar bara app-assets/bilder från egen origin, inte data-/blob-URL:er) |
| `viktkollen.progressPhotos`, profilbild | Framstegs-/profilbilder – **rörs inte** |

## Rensning av gamla kroppsbilder

`legacyBodyImageCleanup.js` tar bort endast bildsträngar (`data:image/…`, `blob:`) ur
nycklarna ovan. Analysresultat, datum, filnamn, viktloggar och framstegsbilder lämnas
orörda. Poster med ett annat `userId` än den inloggade lämnas orörda.

- Körs bara i det lokala flödet efter två tryck (öppna + bekräfta). Aldrig automatiskt.
- Idempotent. Varje nyckel skrivs atomiskt; en avbruten körning kan köras om.
- Oläsbar JSON lämnas orörd. En markör per användare (`…legacyBodyImageCleanup.v1`)
  sparar status och raderas vid kontoradering.
- Skrivningen markerar inte nycklarna för molnsynk (molnkopian är redan bildfri).

## Validering mot riktiga bilder (Chromium, riktig modell)

- WASM-krasch hittad och åtgärdad: MediaPipe 0.10.35 kraschar när bildbredden inte är
  delbar med 4. Arbetsbilden avrundas nu alltid till multiplar av 4.
- 23 bilder utan korrekt scanningpose (vardagsbilder, sittande, utfall, mörker, långt bort)
  avvisades av kvalitetsspärrarna.
- En riktig bakvy (stående person i studio) godkändes i 5 varianter (original, spegelvänd,
  mörkare, längre bort, förskjuten). Bröst- och midjekontur: ingen tydlig förändring i
  alla 4 jämförelser. Samma bild som framvy avvisades.
- Ledpunkternas brus (höftleder ±12 % för samma bild spegelvänd) gör att skelettmått
  bara används som kontroll av lika förutsättningar, aldrig som kroppsförändring.
- Ej validerat på riktiga bilder: framvy och sidovy av stående person, samt verkliga
  förändringar över tid. Trösklarna är inte kalibrerade mot upprepade mätningar.

## Content Security Policy

Appen har i dag ingen CSP. Om en CSP införs behöver den lokala analysen:
`script-src 'self' 'wasm-unsafe-eval'` och `connect-src 'self'` (modell/WASM hämtas
från egen origin). Ingen extern domän behövs.

## Kvar innan Production

- Riktig enhetsverifiering på iPhone (Safari + hemskärms-PWA) och Android (Chrome):
  kamerabehörighet, kamerabyte, orientering, bakgrundsläge, minne/prestanda för WASM.
- Validering av fram- och sidovy samt kalibrering av trösklar mot upprepade mätningar
  på riktiga personer.
- Beslut om det gamla flödet ska sluta spara data-URL-förhandsvisningar (Production-ändring).
