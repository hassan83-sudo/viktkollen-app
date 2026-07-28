# Meal Editing & Nutrition Corrections V1 - manuell testchecklista

## Redigering

- Skapa en måltid i Måltidscenter.
- Öppna redigering via knappen `Redigera`.
- Ändra måltidstexten och spara.
- Ändra datum och kontrollera att måltiden flyttas från dagens dashboard.
- Ändra tid och kontrollera tidslinjens sortering.
- Ändra måltidstyp, till exempel från Automatisk till Mellanmål.
- Avbryt en redigering och kontrollera att inget sparas.

## Manuella näringsvärden

- Korrigera protein.
- Korrigera kalorier.
- Korrigera endast ett värde och kontrollera delvis korrigerad status.
- Korrigera protein, kalorier, kolhydrater och fett och kontrollera manuellt korrigerad status.
- Testa svensk decimal, till exempel `45,5`.
- Testa punktdecimal, till exempel `45.5`.
- Testa negativt värde och kontrollera svenskt felmeddelande.
- Testa bokstäver i ett numeriskt fält och kontrollera att inget sparas.

## Dashboard och AI Coach

- Kontrollera att dashboardens protein och kalorier ändras direkt efter sparad korrigering.
- Kontrollera att proteinprogress och kaloriprogress uppdateras.
- Kontrollera att mest protein och största måltid uppdateras.
- Fråga AI Coach: `Hur mycket protein har jag ätit idag?`
- Fråga AI Coach: `Hur många kalorier har jag fått i mig?`
- Kontrollera att AI Coach använder samma korrigerade värden som dashboarden.
- Återställ automatisk analys och kontrollera att totals ändras tillbaka.

## Robusthet

- Ta bort en måltid medan editorn är öppen.
- Ladda om sidan och kontrollera att sparade ändringar finns kvar.
- Kontrollera mobilvy: knappar ska vara klickbara och fälten ska inte överlappa.
- Kontrollera att chattmåltider fortfarande inte sparas automatiskt.
