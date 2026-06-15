# Deploy PluggArena på Vercel

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

Ingen extra `vercel.json` krävs för nuvarande PluggArena-setup.

## 3. Environment variables

Lägg till i Vercel under:

```text
Project Settings -> Environment Variables
```

Obligatorisk för riktig AI:

```text
OPENAI_API_KEY=din_openai_api_nyckel
```

Valfri modell:

```text
OPENAI_MODEL=gpt-4.1-mini
```

Obligatoriskt för riktiga användarkonton med Supabase:

```text
VITE_SUPABASE_URL=din_supabase_url
VITE_SUPABASE_ANON_KEY=din_supabase_anon_key
```

API-nyckeln ska aldrig ligga i frontendkod. Lokalt kan du använda `.env.local`, som är ignorerad av Git.

## 4. PluggArena-routes att kontrollera efter deploy

Frontend:

```text
/
```

Serverless API:

```text
POST /api/study-buddy
```

Exempel-body:

```json
{
  "subject": "Matematik",
  "question": "Vad är 8 × 7?",
  "options": ["54", "56", "64", "48"],
  "answer": "56"
}
```

Om `OPENAI_API_KEY` saknas ska `/api/study-buddy` returnera en mockad fallback-hint i stället för att krascha.

Det finns inga andra PluggArena-API-rutter i nuvarande MVP.

## 5. Lokal verifiering före deploy

```bash
npm run lint
npm run build
```
