# Deploy Viktkollen på Vercel

## 1. Importera projektet

1. Pusha projektet till GitHub.
2. Gå till Vercel och välj **Add New Project**.
3. Importera repot.

## 2. Build-inställningar

Vercel bör auto-detektera Vite.

Använd:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

Ingen extra `vercel.json` krävs för nuvarande Vite-deploy om Vercels dashboard använder inställningarna ovan.

## 3. Environment variables

Lägg till i Vercel under:

```text
Project Settings -> Environment Variables
```

Obligatoriskt för Supabase Auth, molnbackup och synk:

```text
VITE_SUPABASE_URL=din_supabase_url
VITE_SUPABASE_ANON_KEY=din_supabase_anon_key
```

Server-side Supabase-variabler kan användas av verifierings- och API-flöden:

```text
SUPABASE_URL=din_supabase_url
SUPABASE_ANON_KEY=din_supabase_anon_key
```

Obligatoriskt endast om remote AI eller remote fotoanalys ska vara aktivt i produktion:

```text
OPENAI_API_KEY=din_openai_api_nyckel
OPENAI_MODEL=gpt-4.1-mini
OPENAI_COACH_MODEL=gpt-4.1-mini
NUTRITION_PHOTO_MODEL=gpt-4.1-mini
```

API-nyckeln ska aldrig ligga i frontendkod och ska inte ha `VITE_`-prefix. Lokalt kan `.env.local` användas.

Remote fotoanalys ska bara aktiveras när `OPENAI_API_KEY` är konfigurerad och route-verifieringen passerar:

```text
VITE_NUTRITION_PHOTO_REMOTE_ENABLED=false
```

## 4. API-routes att kontrollera efter deploy

Frontend:

```text
/
```

Serverless API:

```text
POST /api/adaptive-coach
POST /api/nutrition-photo-analysis
```

Båda routes ska kräva giltig Supabase-session, returnera säkra felmeddelanden och inte cacha svar.

Om `OPENAI_API_KEY` saknas ska remote AI/foto inte lova fungerande provider. Appen ska visa begriplig fallback eller disabled state i stället för att krascha.

## 5. Supabase

Kör migrations/SQL för Viktkollens molnbackup och synk innan publik release:

```text
supabase/cloud_sync_v2.sql
```

Verifiera därefter i Supabase SQL Editor:

```text
supabase/release_acceptance_checks.sql
```

Releasekrav:

- `user_backups`, `user_sync_state` och `user_sync_events` finns.
- RLS är aktivt och force RLS används för användarägda tabeller.
- Policies begränsar rader till `auth.uid() = user_id`.
- `user_sync_state` har unik rad per användare.
- Inga client-flöden kräver service-role key.

## 6. Release-verifiering

Kör före deploy:

```bash
npm run lint
npm test
npm run build
git diff --check
```

Kör även stagingkontrollen när produktionsliknande env finns:

```bash
npm run validate:staging
```

`npm run verify:release` får användas i CI eller lokal releasekörning där det är okej att skriva releaseartefakter.
