# Dietary Preferences & Recommendation Filtering V1

## Automatisk verifiering

- `npm run test`
- `npm run lint`
- `npm run build`
- `git diff --check`

## Manuell genomgång

- Öppna Måltidscenter och kontrollera att UI:t är oförändrat för befintliga kostvyer.
- Spara kosttyp vegetarisk, vegansk och pescetarisk.
- Spara laktosfritt, glutenfritt och halal prioriteras.
- Lägg till livsmedel att undvika och föredra med kommatecken.
- Avbryt en ändring och kontrollera att sparat värde ligger kvar.
- Rensa preferenser och kontrollera bekräftelsetexten: `Vill du ta bort dina sparade matpreferenser?`.
- Kontrollera att Quick Add visar alla mallar som standard.
- Växla Quick Add till `Matchar mina matval` och kontrollera att inkompatibla mallar döljs men inte raderas.
- Kontrollera att handlingsplanen filtrerar bort inkompatibla mallförslag.
- Kontrollera att nutritionvärden, proteinmål och gamla måltider inte ändras av preferenser.
- Fråga AI Coach om veganska, vegetariska, laktosfria och glutenfria förslag.
- Fråga AI Coach vilka måltidsmallar som passar dina matval.
- Fråga AI Coach varför en favoritmall inte föreslås.
- Fråga AI Coach om allergi och kontrollera att svaret inte lovar medicinsk säkerhet.
