# Vercel Staging Env Runbook

Lägg aldrig riktiga secret-värden i repo. Sätt dem i Vercel dashboard eller CLI
för Preview först. Kopiera inte server-only secrets till `VITE_`-variabler.

| Env | Preview | Production | Scope | Secret | Om saknas |
| --- | --- | --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Ja | Ja | Client | Nej | Auth, cloud sync och AI-auth kan inte användas. |
| `VITE_SUPABASE_ANON_KEY` | Ja | Ja | Client | Nej | Supabase-klienten startar utan auth/cloud. |
| `SUPABASE_URL` | Ja | Ja | Server | Nej | Server-side auth/admin routes kan inte initiera Supabase. |
| `SUPABASE_ANON_KEY` | Ja | Ja | Server | Nej | Server-side auth verifiering faller till auth unavailable. |
| `SUPABASE_SERVICE_ROLE_KEY` | Ja | Senare | Server-only | Ja | Entitlements faller till free och deletion blockeras säkert. |
| `OPENAI_API_KEY` | Ja | Ja när AI är live | Server-only | Ja | AI/photo routes använder mock/safe fallback eller provider-not-configured. |
| `OPENAI_MODEL` | Valfritt | Valfritt | Server | Nej | Defaultmodell används. |
| `OPENAI_COACH_MODEL` | Valfritt | Valfritt | Server | Nej | Defaultmodell används. |
| `OPENAI_COACH_TIMEOUT_MS` | Valfritt | Valfritt | Server | Nej | Default timeout används. |
| `OPENAI_COACH_RATE_LIMIT_MAX` | Valfritt | Valfritt | Server | Nej | Default rate limit används. |
| `OPENAI_LEGACY_AI_RATE_LIMIT_MAX` | Valfritt | Valfritt | Server | Nej | Default route-limit används. |
| `NUTRITION_PHOTO_MODEL` | Valfritt | Valfritt | Server | Nej | Defaultmodell används. |
| `NUTRITION_PHOTO_MAX_FILE_BYTES` | Valfritt | Valfritt | Server | Nej | Default uploadgräns används. |
| `NUTRITION_PHOTO_TIMEOUT_MS` | Valfritt | Valfritt | Server | Nej | Default timeout används. |
| `NUTRITION_PHOTO_RATE_LIMIT_MAX` | Valfritt | Valfritt | Server | Nej | Default rate limit används. |
| `MEAL_ANALYSIS_RATE_LIMIT_MAX` | Valfritt | Valfritt | Server | Nej | Default route-limit används. |
| `BODY_ANALYSIS_RATE_LIMIT_MAX` | Valfritt | Valfritt | Server | Nej | Default route-limit används. |
| `ACCOUNT_DELETION_ENABLE_AUTH_DELETE` | `false` först | `false` tills godkänt | Server | Nej | Auth-user deletion körs inte, men dry-run/cloud-data kan testas. |
| `VITE_NUTRITION_PHOTO_REMOTE_ENABLED` | Ja | Ja när provider är klar | Client | Nej | Fotoanalys hålls lokal/mock om `false`. |
| `VITE_NUTRITION_PHOTO_MAX_FILE_MB` | Valfritt | Valfritt | Client | Nej | Default clientgräns används. |
| `VITE_NUTRITION_PHOTO_TIMEOUT_MS` | Valfritt | Valfritt | Client | Nej | Default clienttimeout används. |
| `VITE_NUTRITION_PHOTO_RATE_LIMIT_MAX` | Valfritt | Valfritt | Client | Nej | Clientvisning använder default. |

## Först i staging

1. Sätt client Supabase envs.
2. Sätt server Supabase anon envs.
3. Kör `npm run validate:staging` lokalt mot motsvarande env-fil.
4. Sätt `SUPABASE_SERVICE_ROLE_KEY` endast i Vercel server environment.
5. Låt `ACCOUNT_DELETION_ENABLE_AUTH_DELETE=false`.
6. Verifiera `/api/entitlements` och `/api/account-deletion` dry-run.

## Production

Sätt inte `ACCOUNT_DELETION_ENABLE_AUTH_DELETE=true` i production innan staging
har bevisat Test User A/B-isolering, cloud deletion och auth deletion.
