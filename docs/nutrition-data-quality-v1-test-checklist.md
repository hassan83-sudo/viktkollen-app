# Nutrition Data Quality & Confidence V1 - manuell testchecklista

## Måltider och confidence

- Skapa en tydlig måltid med mängd, till exempel `200 g kyckling, 150 g ris och 100 g broccoli`.
- Skapa en vag måltid utan mängd, till exempel `Middag`.
- Skapa en måltid med flera ingredienser.
- Kontrollera att confidence-status visas på dagens tidslinje.
- Öppna confidence-förklaringen.
- Kontrollera att förbättringstips visas och är konkreta.

## Måltider att granska

- Kontrollera panelen `Måltider att granska`.
- Testa filtren: Alla, Tydligt underlag, Begränsat underlag, Manuellt korrigerade, Behöver granskas.
- Redigera en måltid från review-panelen.
- Lägg till mängd eller enhet i redigeringen.
- Kontrollera att statusen förändras efter sparning.
- Testa `Ignorera för tillfället`.

## Manuella korrigeringar

- Manuellt korrigera protein.
- Manuellt korrigera kalorier.
- Kontrollera delvis manuell status.
- Korrigera alla huvudfält.
- Kontrollera manuell status.
- Återställ automatisk analys.

## Dag, vecka och månad

- Kontrollera dagens quality summary.
- Kontrollera veckans quality-data.
- Kontrollera månadens quality-data.
- Kopiera månadsrapport.
- Kontrollera quality-text i rapporten.
- Exportera månads-JSON.
- Kontrollera att quality-fält finns i JSON.

## AI Coach

- Fråga: `Hur säkra är dagens näringsvärden?`
- Fråga: `Vilka måltider behöver jag granska?`
- Fråga: `Varför är kalorierna osäkra?`
- Fråga: `Vilka måltider saknar mängder?`
- Fråga: `Hur bra är veckans dataunderlag?`
- Fråga: `Hur bra är månadens dataunderlag?`
- Fråga: `Vilka värden har jag korrigerat manuellt?`

## Robusthet

- Kontrollera tom måltidslista.
- Kontrollera måltid utan text.
- Kontrollera måltid med mycket lång text.
- Kontrollera måltid med trasigt datum.
- Kontrollera mobilvy.
- Ladda om sidan.
- Kontrollera att data finns kvar.
