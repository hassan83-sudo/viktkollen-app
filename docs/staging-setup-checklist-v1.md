# Staging Setup Checklist V1

## Miljovariabler

Client-safe:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_NUTRITION_PHOTO_REMOTE_ENABLED`
- `VITE_NUTRITION_PHOTO_MAX_FILE_MB`
- `VITE_NUTRITION_PHOTO_TIMEOUT_MS`
- `VITE_NUTRITION_PHOTO_RATE_LIMIT_MAX`

Server-side only:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `NUTRITION_PHOTO_MODEL`
- `NUTRITION_PHOTO_MAX_FILE_BYTES`
- `NUTRITION_PHOTO_TIMEOUT_MS`
- `NUTRITION_PHOTO_RATE_LIMIT_WINDOW_MS`
- `NUTRITION_PHOTO_RATE_LIMIT_MAX`

Lagg aldrig server-side nycklar med `VITE_`-prefix.

## Kommandon

```bash
npm run validate:staging
npm run verify:photo-route
npm run verify:coach-route
npm run verify:preview -- https://din-preview-url
npm run verify:release
```

## Supabase

Kor `supabase/release_acceptance_checks.sql` i SQL Editor och kontrollera:

- tabellerna `user_backups`, `user_sync_state`, `user_sync_events`
- RLS enabled
- policies scope: `auth.uid() = user_id`
- index/unique constraints, sarskilt `user_sync_state.user_id`

## Vercel

Kontrollera i Vercel dashboard:

- Supabase client env finns endast som `VITE_`
- `OPENAI_API_KEY` finns endast server-side
- `/api/adaptive-coach` deployas
- `/api/nutrition-photo-analysis` deployas
- HTTPS anvands
- PWA-filer finns i production build

READY far endast sattas efter att Manual Release Acceptance V2 ar kord mot riktig staging/preview.

## Release Candidate V1

For RC V1:

1. Kor `npm run validate:staging`.
2. Kor `npm run verify:photo-route`.
3. Kor `npm run verify:preview -- https://preview-url` om URL finns.
4. Kor `supabase/release_acceptance_checks.sql` i Supabase SQL Editor.
5. Folj `docs/release-candidate-user-runbook-v1.md`.
6. Dokumentera resultat i `docs/release-candidate-v1-result.json` eller en saker kopia.

Blockerade externa steg ar inte PASS. De ska sta som `blockedByEnvironment` tills de faktiskt ar korda.
