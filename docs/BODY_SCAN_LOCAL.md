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

## Content Security Policy

Appen har i dag ingen CSP. Om en CSP införs behöver den lokala analysen:
`script-src 'self' 'wasm-unsafe-eval'` och `connect-src 'self'` (modell/WASM hämtas
från egen origin). Ingen extern domän behövs.

## Kvar innan Production

- Riktig enhetsverifiering på iPhone (Safari + hemskärms-PWA) och Android (Chrome).
- Kalibrering av tröskelvärden mot riktiga upprepade mätningar.
- Beslut om befintlig historik ska sluta spara data-URL-förhandsvisningar lokalt.
