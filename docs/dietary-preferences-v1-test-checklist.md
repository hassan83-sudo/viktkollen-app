# Dietary Preferences & Recommendation Filtering V1

## Automatisk verifiering

- `npm run test`
- `npm run lint`
- `npm run build`
- `git diff --check`

## Manuell genomgång

- Öppna Matpreferenser utan sparad data.
- Välj allätare.
- Välj vegetarisk.
- Välj vegansk.
- Välj pescetarisk.
- Välj anpassad.
- Slå på laktosfri preferens.
- Slå på glutenfri preferens.
- Slå på halalpreferens.
- Lägg till matvara att undvika med Enter.
- Ta bort matvara att undvika.
- Lägg till föredragen matvara med Enter.
- Ta bort föredragen matvara.
- Försök lägga samma matvara i båda listorna.
- Kontrollera valideringsfel.
- Spara och kontrollera statusmeddelande.
- Avbryt en ändring och kontrollera att sparat värde ligger kvar.
- Ladda om sidan.
- Kontrollera sammanfattning.
- Kontrollera Action Plan.
- Kontrollera veganska proteinförslag.
- Kontrollera att inkompatibla förslag försvinner.
- Skapa kompatibel måltidsmall.
- Skapa inkompatibel måltidsmall.
- Kontrollera mallförslag.
- Kontrollera Quick Add-filter.
- Använd en mall manuellt.
- Fråga AI Coach om matpreferenser.
- Fråga AI Coach om veganskt protein.
- Fråga AI Coach om mallar.
- Rensa preferenser och kontrollera bekräftelsetexten: `Vill du ta bort dina sparade matpreferenser?`.
- Kontrollera att meals finns kvar.
- Kontrollera att templates finns kvar.
- Kontrollera att nutrition goals finns kvar.
- Kontrollera mobilvy.
- Kontrollera att Quick Add visar alla mallar som standard.
- Växla Quick Add till `Matchar mina matval` och kontrollera att inkompatibla mallar döljs men inte raderas.
- Kontrollera att handlingsplanen filtrerar bort inkompatibla mallförslag.
- Kontrollera att nutritionvärden, proteinmål och gamla måltider inte ändras av preferenser.
- Fråga AI Coach om veganska, vegetariska, laktosfria och glutenfria förslag.
- Fråga AI Coach vilka måltidsmallar som passar dina matval.
- Fråga AI Coach varför en favoritmall inte föreslås.
- Fråga AI Coach om allergi och kontrollera att svaret inte lovar medicinsk säkerhet.

## Begränsningar

- Dietary preferences sparas lokalt.
- De ingår inte automatiskt i nuvarande Cloud Backup om nyckeln inte redan omfattas av befintlig allowlist.
- Funktionen ersätter inte medicinsk rådgivning eller kontroll av ingrediensförteckningar.
