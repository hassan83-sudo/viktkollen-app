# Monthly Nutrition Report & Progress Insights V1 - manuell testchecklista

## Månadsvy

- Öppna Måltidscenter.
- Växla mellan Dag, Vecka och Månad.
- Kontrollera att Månad behåller befintligt UI-flöde och inte påverkar formulär, Quick Add eller historik.
- Byt till föregående och nästa månad.
- Kontrollera att aktuell månad visar ofullständig registrering när alla dagar inte har passerat.

## Rapportinnehåll

- Kontrollera att korten visar registrerade dagar, måltider, protein, kalorier och måldagar.
- Kontrollera veckografen för protein och kalorier.
- Kontrollera dagsrutnätet för tomma dagar, dagar med data och framtida dagar.
- Kontrollera mönster: vanlig måltidstyp, återkommande måltider, sena mål och långa uppehåll.
- Kontrollera viktrelationen när viktdata finns och när den saknas.

## Export och kopiering

- Klicka Kopiera rapport och kontrollera att en läsbar text kopieras.
- Klicka Exportera JSON och kontrollera att filen innehåller månadsrapporten utan auth-, Supabase- eller backupdata.

## AI Coach

- Fråga: "Hur har min månad sett ut?"
- Fråga: "Vad var mitt genomsnittliga protein denna månad?"
- Fråga: "Hur många dagar registrerade jag mat denna månad?"
- Fråga: "Vilken vecka hade högst protein denna månad?"
- Fråga: "Vilken dag hade mest protein denna månad?"
- Fråga: "Hur skiljer sig denna månad från förra månaden?"
- Fråga: "Vilken måltid åt jag oftast denna månad?"
- Fråga: "Hur förändrades min vikt denna månad?"
- Fråga: "Vad ska jag fokusera på nästa månad?"

## Edge cases

- Tom måltidslista.
- Tom viktlogg.
- Månad med mycket få registrerade dagar.
- Framtida månad.
- Två måltider samma dag.
- Måltider nära midnatt.
- Måltider med ISO-datum och datum utan klockslag.
