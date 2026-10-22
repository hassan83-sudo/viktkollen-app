# Digital wardrobe — local feature review, 22 October 2026

Branch: `feature/ai-eye-wardrobe-link-20261022`. Builds on wardrobe link `121f8e4`.

## Entry point and implemented behavior

Home → Smart kamera och AI-ögon (the card image) → Kläder & stil → Din garderob.
The existing Garderob – klädhjälp shares the same storage.

- Existing `viktkollen.notice.wardrobe.v1` storage is extended with image/color, selected garment IDs and named outfits. Existing garments, wear history and other metadata survive edits.
- Users can take a photo with the device file-camera picker or choose a raster image, name/categorize it, select several garments, save/restore outfits and explicitly record today's wear.
- JPEG/PNG/WebP files up to 8 MB are processed by the existing profile-photo pipeline into a JPEG thumbnail with a maximum edge of 256 px. Canvas re-encoding discards source metadata. SVG and remote image URLs are rejected.
- Local image storage requires explicit consent per image. Optional remote analysis has separate per-image consent and an explicit send button. No automatic uploads, retries or background recognition.
- Existing object-bank analysis supplies optional object-name suggestions. Users review the name and choose the garment type; nothing is saved automatically. Auth, image-bound consent proof, server quota, rate limits, provider controls and dispatch deduplication remain in the existing API.
- The mannequin is a schematic 2D collage. Garment photos retain their backgrounds; it does not extract garment silhouettes, estimate body measurements, predict fit or provide realistic virtual try-on. The last selected garment within a slot is displayed.
- Local data is browser-profile scoped, not encrypted or synchronized. The UI explains shared-profile visibility and loss on browser-data clearing. Confirmed garment deletion removes its photo and references in outfits, selection and wear history.
- Camera, weather and history paths are preserved. Storage writes are atomic and a 2.5-million-character ceiling leaves room for the rest of the app; a failed write preserves existing data. Maximums are 100 new-UI garments and 30 outfits.

## Verification

- 20 wardrobe unit/component tests passed across storage, image boundaries, form consent and outfit selection. Coverage includes legacy records, invalid storage, failed writes, separate consents, one in-flight AI request, abort/late results, manual fallback, saved outfits, deletion and unchanged camera/weather rendering.
- Mobile Playwright test passed at 390 and 320 px, using the real local app, synthetic raster input and mocked/blocked backends. No automatic object-bank or consent uploads occurred. No horizontal overflow; raster was saved as JPEG, outfit re-selection worked and confirmed deletion removed the garment.
- Changed-file ESLint: zero errors/warnings. Full-project ESLint: 50 errors and 9 warnings, all outside changed files (against `121f8e4`).
- Build passed, with the existing large-chunk warning.
- Related camera/security run: 40 passed, 1 failed. The existing failure is the removed `Mina ta-med-listor` label in `smartCameraSecurity.test.jsx`; it was already present before this work. No unrelated navigation change was made.

Commands:

```text
npx vitest run src/services/wardrobeStorage.test.js src/services/wardrobePhoto.test.js src/features/smart-camera/components/OutfitWardrobeSelection.test.jsx src/features/smart-camera/components/WardrobeGarmentForm.test.jsx
npx playwright test --config playwright.a11y.config.js tests/a11y/wardrobe.spec.js
npm run lint
npm run build
```

The mobile run used local port 5193 and installed Chrome via the existing `A11Y_E2E_PORT` and `A11Y_CHROMIUM_EXECUTABLE` options. No real account, database write or paid provider request was used.

## Remaining before remote review

The user chose local preparation only after being informed that this feature branch has no branch-specific Vercel Staging configuration. No environment variable was changed and no push/deployment was performed for this expansion. Do not let a new deployment inherit unverified shared Preview credentials.

Before Preview, obtain approval for branch-specific Staging isolation and have the existing Staging server Secret configured securely. Verify client and server project IDs and ensure no server key reaches `VITE_` variables. No new key or service is needed.

Live recognition and phone hardware-camera capture have not been tested. The reused AI Eye runtime currently passes empty `selectedThresholds` to billing; a hard monetary budget for this endpoint has therefore **not** been established by this review. Do not claim the AI Help 10 kr budget protects this endpoint. Review/enable the existing applicable monetary cost safeguard before a live paid recognition test. Existing per-user quota, provider/rate controls and output-token bounds are retained; this change does not introduce a new monetary budget or paid service.

No changes to main, Production, database schemas, payments, keys or other Preview branches.
