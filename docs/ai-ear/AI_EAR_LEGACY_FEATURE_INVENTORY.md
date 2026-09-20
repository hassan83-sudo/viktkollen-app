# AI-ÖRAT — INVENTERING AV TIDIGARE FUNKTIONER

> **Status:** READ-ONLY INVENTERING  
> **Datum:** 2026-09-20  
> **Syfte:** Fullständig kartläggning av alla AI-örat-funktioner i git-historiken (sprint 1–7) jämfört med dagens production/main, inklusive providers, endpoints, status och återintegreringsplan.

---

## 1. SAMMANFATTNING & HISTORISK ÖVERSIKT

Under utvecklingen av AI-örat genomfördes sprint 1–7 i en sammanhängande branch-kedja:
* `ai-ear-sprint1` (commit `ebb2089`)
* `ai-ear-sprint2` (commit `780fa9c`)
* `ai-ear-sprint3` (commit `2f23742`)
* `ai-ear-sprint4` (commit `a35271c`)
* `ai-ear-sprint6` (commit `8a3d604`)
* `ai-ear-sprint7` (commit `bb24648`)

### Varför syns inte de gamla funktionerna i dagens production?
1. **Brancherna mergades aldrig till `main`:** Hela sprintkedjan (1–7) stannade på branch `ai-ear-sprint7` och blev liggande orörd.
2. **Separat implementation i `main`:** Senare skapades en separat produktionskedja direkt i `main` (commit `c8899a5`) med fokus på **Google Perch + YAMNet** (fågelläten och miljöljud) via en säker server-hop (`/api/ai-ear/interpret`) till en privat Google Cloud Run-tjänst (`perch-inference`). Denna lades inuti Smart kamera (`AiEarMode.jsx`).
3. **Koden är intakt och bevarad:** All kod för AudD (musikigenkänning), ACRCloud (nynna/vissla/melodi), OpenAI Speech-to-Text (ord ur låt) och fordonskategorier finns helt intakt i git-historiken på branchen `ai-ear-sprint7`.

---

## 2. DETALJERAD FUNKTIONSINVENTERING

| Funktion / Kategori | Branch / Commit | Relevanta filer | Extern Provider | Tidigare Status | Finns i main? | Finns i prod? | UI finns? | Backend finns? | Credentials krävs? | Vad saknas idag? | Återintegreringsstatus |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- | :--- | :--- |
| **Musikigenkänning** *(Identifiera spelad låt)* | `ai-ear-sprint4` (`a35271c`) | `api/ai-ear-music-recognition/index.js`<br>`src/services/aiEar/musicRecognitionProvider.js`<br>`src/services/aiEar/analyzeAudio.js`<br>`src/features/ai-ear/AiEarSection.jsx` | **AudD API** (`https://api.audd.io/`) | **Färdig & fungerande** | ❌ Nej | ❌ Nej | ✅ På branch | ✅ På branch | `AUDD_API_TOKEN` | Mergning till main & API-token i Vercel | **SAFE** |
| **Melodiigenkänning** *(Nynna, vissla, sjung melodi)* | `ai-ear-sprint6` (`8a3d604`) | `api/ai-ear-humming-recognition/index.js`<br>`src/services/aiEar/hummingRecognitionProvider.js`<br>`src/features/ai-ear/AiEarSection.jsx` | **ACRCloud** *(Humming Identification)* | **Färdig & fungerande** | ❌ Nej | ❌ Nej | ✅ På branch | ✅ På branch | `ACRCLOUD_HOST`<br>`ACRCLOUD_ACCESS_KEY`<br>`ACRCLOUD_ACCESS_SECRET` | Mergning till main & ACRCloud-konto/nycklar | **SAFE** |
| **Taligenkänning / Speech-to-text** *(Ord ur en låt / tal)* | `ai-ear-sprint7` (`bb24648`) | `api/ai-ear-lyrics-transcription/index.js`<br>`src/services/aiEar/lyricsTranscriptionProvider.js`<br>`src/features/ai-ear/AiEarSection.jsx` | **OpenAI** *(gpt-transcribe / whisper)* | **Färdig & fungerande** | ❌ Nej | ❌ Nej | ✅ På branch | ✅ På branch | `OPENAI_API_KEY` *(finns redan i prod)* | Mergning till main (inga nya secrets krävs) | **SAFE** |
| **Låtsökning från låttext** *(Identifiera låt från text)* | `ai-ear-sprint7` (`bb24648`) | `src/services/aiEar/lyricsSearchProvider.js` | *Planerad Musixmatch / Genius* | **Placeholder / Not connected** | ❌ Nej | ❌ Nej | ✅ På branch | ❌ Ingen | Okänt (Musixmatch commercial terms ej klara) | Riktig text-till-låt-databastjänst | **NEEDS ADAPTATION** |
| **Fågelläten / Fågelsång** | `ai-ear-sprint3` (placeholder)<br>`main` `c8899a5` (prod) | `api/ai-ear/interpret/index.js`<br>`src/features/ai-ear/AiEarMode.jsx`<br>`src/services/aiEarInterpret.js` | **Google Perch v2 + YAMNet** *(Cloud Run)* | **Färdig i production** | ✅ Ja | ✅ Ja | ✅ I Smart Kamera | ✅ Cloud Run rc10ze-1 | GCP Service Account Token | Inget (är färdig i prod) | **BEVARAS ORÖRD** |
| **Fordon & Maskiner** *(Bil, MC, tåg, flyg, maskin)* | `ai-ear-sprint3` (`2f23742`) | `src/services/aiEar/audioResultModel.js`<br>`src/services/aiEar/providers.js`<br>`src/features/ai-ear/AiEarSection.jsx` | *Tidigare ingen (placeholder)*<br>*(Kan nu använda YAMNet)* | **UI & datamodell klar, provider placeholder** | ❌ Nej | ❌ Nej | ✅ På branch | ❌ Var ej ansluten | Inga (eller Cloud Run) | Anslutning till YAMNet på Cloud Run | **NEEDS ADAPTATION** |
| **Andra miljöljud / Allmän klassificering** | `ai-ear-sprint3` (`2f23742`) | `src/services/aiEar/providers.js` | **YAMNet** *(finns i nuvarande backend)* | **Placeholder på branch, aktiv i prod backend** | Delvis (via Perch/YAMNet) | ✅ Ja (i Smart Kamera) | Delvis | ✅ Ja | GCP Auth | UI-visning av miljöklasser | **SAFE / MERGED** |
| **Arabisk musik / Arabiska låtar** | *Ingen specifik branch* | *N/A* | *Ingen specifik (AudD/ACRCloud global)* | **Aldrig implementerat som egen kategori** | ❌ Nej | ❌ Nej | ❌ Nej | ❌ Nej | Inga | AudD & ACRCloud känner igen arabiska hits i sin globala databas | **OBSOLETE (Idé)** |
| **Fristående AI-örat Hubb / Sektion** | `ai-ear-sprint1` (`ebb2089`) | `src/features/ai-ear/AiEarSection.jsx`<br>`src/services/more/moreFolders.js` | Internt UI | **Färdig sektion under Mer** | ❌ Nej | ❌ Nej | ✅ På branch | N/A | Inga | Egen sektionsingång från Hem | **SAFE** |

---

## 3. GRANSKNING AV GAMLA SPRINTER & PREVIEWS

### Sprint 1 (`ebb2089`) — Bassektion & Navigation
* **Vad som byggdes:** Ny `AiEarSection.jsx` under Mer, länkades i `moreFolders.js` med ikon `aiEar`.
* **Kategorier:** Musik, Nynna & vissla, Fågelläten, Fordon & maskiner, Andra ljud.
* **Status:** Komplett UI-struktur och i18n-översättningar (sv/en).

### Sprint 2 (`780fa9c`) — Mikrofon & Inspelning
* **Vad som byggdes:** Web Audio/MediaRecorder-motor.
* **Funktioner:** `navigator.mediaDevices.getUserMedia`, inspelningstimer, vågformsindikator, Stoppa/Spela in igen/Radera, lokal ljuduppspelning (`<audio controls>`), säker `track.stop()` vid avmontering.
* **Status:** 100% fungerande i alla moderna webbläsare.

### Sprint 3 (`2f23742`) — Analysarkitektur & Provider-mönster
* **Vad som byggdes:**
  * `analyzeAudio.js`: Central dispatcher för ljudanalys.
  * `audioResultModel.js`: Enhetlig normaliserad datastruktur (`createAudioAnalysisResult`, `analysisTypes`, `vehicleSubcategories`).
  * `providers.js`: Modulära providerslots för varje kategori.
* **Status:** Arkitekturen är fail-closed, defensiv och typgodkänd.

### Sprint 4 (`a35271c`) — AudD Musikigenkänning
* **Vad som byggdes:**
  * `api/ai-ear-music-recognition/index.js`: Server-endpoint som anropar AudD API med HMAC-consenttoken och Supabase rate limiting.
  * `musicRecognitionProvider.js`: Klientprovider som skickar ljud och tolkar träffar (artist, titel, album, årtal, label).
  * Samtyckesdialog i UI (`audio-music-recognition`).
* **Status:** Riktig, fullständig och testad implementation.

### Sprint 5 — Research (Lyrics Search)
* **Vad som gjordes:** Utvärderade Musixmatch och andra lyrics-API:er. Konklusion: Ingen ren fri kommersiell licens fanns tillgänglig, fullständig låtsökning från text sköts upp.

### Sprint 6 (`8a3d604`) — ACRCloud Nynna & Vissla
* **Vad som byggdes:**
  * `api/ai-ear-humming-recognition/index.js`: Server-endpoint med HMAC-SHA1-signering mot ACRCloud AVR (Cover Song/Humming engine).
  * `hummingRecognitionProvider.js`: Klientprovider som mappar meloditräffar och konfidens (0–1).
  * Eget samtyckesflöde för meloditolkning (`audio-humming-recognition`).
* **Status:** Riktig, fullständig implementation.

### Sprint 7 (`bb24648`) — OpenAI Speech-to-Text ("Ord ur en låt")
* **Vad som byggdes:**
  * `api/ai-ear-lyrics-transcription/index.js`: Server-endpoint som anropar OpenAI:s transkriberings-API (`gpt-transcribe`) med befintlig `OPENAI_API_KEY`.
  * `lyricsTranscriptionProvider.js`: Returnerar säker, sanerad textsträng `"Jag hörde: [text]"`.
  * `lyricsSearchProvider.js`: Säker placeholder för framtida låtsökningssteg.
* **Status:** Riktig, fullständig implementation av taltranskribering.

---

## 4. EXTERNA PROVIDERS, SECRETS OCH CREDENTIALS

| Provider | Tjänst / Syfte | Endpoint / Modell | Miljövariabler / Secrets | Status i Miljön |
| :--- | :--- | :--- | :--- | :--- |
| **AudD** | Exakt musikigenkänning | `https://api.audd.io/` | `AUDD_API_TOKEN`<br>`AI_EAR_MUSIC_TIMEOUT_MS` | Saknas i Vercel (kräver AudD API Token) |
| **ACRCloud** | Nynna, vissla, melodi | `https://${ACRCLOUD_HOST}/v1/identify` | `ACRCLOUD_HOST`<br>`ACRCLOUD_ACCESS_KEY`<br>`ACRCLOUD_ACCESS_SECRET` | Saknas i Vercel (kräver ACRCloud-projekt med Humming påslaget) |
| **OpenAI** | Speech-to-text / Tal | `https://api.openai.com/v1/audio/transcriptions` (`gpt-transcribe`) | `OPENAI_API_KEY` | **Finns redan i production** (används av AI Coach/Vision) |
| **Google Cloud** | Fågelläten / Miljöljud (YAMNet) | `perch-inference` (`/v2/interpret`) | `GOOGLE_SERVICE_ACCOUNT_KEY`<br>`PERCH_INFERENCE_URL`<br>`AI_EAR_ENABLED` | **Finns och är aktiv i production** |

---

## 5. BEVARANDE AV BEFINTLIG FÅGEL-/LJUD-BACKEND

> [!IMPORTANT]
> **Ingen återintegrering får röra eller förändra den befintliga produktionspipelinen.**

Nuvarande produktion i `main`:
* **Backend:** Cloud Run `rc10ze-1` (`perch-inference`) med Google Perch v2 + YAMNet.
* **Server-hop:** `/api/ai-ear/interpret` med Google ID-token och HMAC-consentproof (`ai-ear-interpret`).
* **Klientmotor:** `AiEarMode.jsx`, `aiEarAudio.js`, `aiEarInterpret.js`.

### Varför återintegreringen är 100% säker:
1. **Separata endpoints:**
   * `/api/ai-ear/interpret` (Perch/YAMNet) rörs inte.
   * `/api/ai-ear-music-recognition` (AudD) är en helt fristående serverless route.
   * `/api/ai-ear-humming-recognition` (ACRCloud) är en helt fristående serverless route.
   * `/api/ai-ear-lyrics-transcription` (OpenAI) är en helt fristående serverless route.
2. **Separata HMAC-consent tokens:**
   * `analysisConsentPurposes.aiEarInterpret`
   * `analysisConsentPurposes.audioMusicRecognition`
   * `analysisConsentPurposes.audioHummingRecognition`
   * `analysisConsentPurposes.audioLyricsTranscription`
3. **Ingen kodkollision:**
   * De gamla funktionerna kan integreras i en ren, modulär AI-örat-hubb som låter användaren välja läge (Musik, Nynna/Vissla, Tal, Fåglar/Natur), där varje läge anropar sin egen dedikerade backend.

---

## 6. FRAMTIDA HEM-LAYOUT — BESLUTSUNDERLAG

*(Dokumentation inför kommande implementationssprint — inga ändringar gjorda nu)*

### Beslut för Hem-sektionen:
* **Ny kortgrupp på Hem:**
  ```text
  ┌─────────────────┬─────────────────┬─────────────────┐
  │     AI ÖGAT     │   MATSCANNING   │     AI ÖRAT     │
  │    (Vänster)    │    (Mitten)     │    (Höger)      │
  └─────────────────┴─────────────────┴─────────────────┘
  ```
* **AI Örat:** Blir en **egen direkt ingång** från startsidan (ligger inte längre gömd inuti AI Ögat).
* **Kroppsscanning:** Flyttas ner till nästa lämpliga rad/kortplats.
* **Alla funktioner bevaras:** AI Ögat, Matscanning, Kroppsscanning och AI Örat förblir fullt tillgängliga.

---

## 7. PRIORITERAD ÅTERINTEGRERINGSLISTA

### PRIORITY 1: Färdiga funktioner redo för återintegrering
1. **Fristående AI-örat-sektion / Hubb:**
   * Gör AI-örat till en egen vy med direkt åtkomst från Hem och Mer.
2. **Taltranskribering ("Ord ur en låt" / OpenAI Speech-to-Text):**
   * Färdig kod, använder befintlig `OPENAI_API_KEY`. Inga nya externa abonnemang krävs.
3. **Befintlig Fågel- och Miljöljudsanalys (Perch + YAMNet):**
   * Kopplas in som "Fåglar & Natur" i den nya hubben.

### PRIORITY 2: Färdiga funktioner som kräver API-nycklar
4. **Musikigenkänning (AudD):**
   * Kräver endast att `AUDD_API_TOKEN` läggs till i Vercel.
5. **Melodiigenkänning (ACRCloud Humming):**
   * Kräver endast att ACRCloud-konto och nycklar (`ACRCLOUD_HOST`, `ACRCLOUD_ACCESS_KEY`, `ACRCLOUD_ACCESS_SECRET`) läggs till i Vercel.

### PRIORITY 3: Anpassningar och framtida utökningar
6. **Fordon & Maskiner:**
   * Kan anslutas till befintlig YAMNet-modell i Cloud Run för att klassificera motorer, bilar, tåg och flygplan istället för att vara placeholder.
7. **Låtsökning från transkriberad text:**
   * Ansluta en säker låttextdatabas när kommersiell leverantör valts.

---

## 8. GRANSKNINGSBEKRÄFTELSE

* **Ändrade appfiler:** 0
* **Genomförda commits/merges:** 0
* **Deployments:** 0
* **Databasändringar:** 0
* **Rapport sparad till:** `docs/ai-ear/AI_EAR_LEGACY_FEATURE_INVENTORY.md`
