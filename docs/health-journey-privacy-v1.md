# Health Journey Privacy V1

Health Journey ar privacy-first och derived-only.

## Ingen ny persistence

Journey events sparas inte i en egen localStorage-nyckel. De byggs fran befintliga modeller nar vyer eller rapporter behover dem.

Det betyder:

- ingen ny sync allowlist
- ingen ny backupmodell
- ingen ny importmodell
- ingen ny authmodell
- ingen ny databas

## Blockerade data

Journey ska aldrig exponera:

- auth/session/token
- e-post
- full user ID
- device ID
- raw meal history
- raw weight log
- raw check-in history
- prompts
- provider responses
- bilder
- base64
- kanslig fritext
- medicinska slutsatser

Relaterade entiteter maskas med stabil hash via `relatedEntityIdMasked`.

## AI-minimering

AI-refinement ar avstangt tills anvandaren aktivt ger samtycke och klickar pa knappen i `HealthJourneyCenter`.

Minimal payload innehaller bara kategorier, coverage, confidence, begransningar och en kort anvandarfraga. AI far formulera forklaring, inte andra fakta.

## Export och rapporter

Rapporter far exportera en kompakt journey-summary. Derived full timeline ska inte exporteras utan separat privacybeslut.

## Saknad data

Saknad data visas som limitation. Den ska inte tolkas som misslyckande, risk, diagnos eller personlig egenskap.
