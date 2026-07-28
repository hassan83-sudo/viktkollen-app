# Nutrition Dashboard V1 - manuell testchecklista

Testa i webbläsaren efter att appen laddats med befintligt måltidsflöde.

## Grundflöde

- Öppna Måltidscenter utan måltider för dagens datum.
  - Förväntat: dashboarden visar tomt läge och inga brutna värden.
- Lägg till frukost.
  - Förväntat: frukost visas i tidslinjen och summeringen uppdateras.
- Lägg till lunch.
  - Förväntat: lunch visas efter frukost och protein/kalorier ökar.
- Lägg till middag.
  - Förväntat: tidslinjen är kronologisk och antal måltider stämmer.
- Ta bort en måltid.
  - Förväntat: summering, tidslinje, jämförelser och insikter uppdateras direkt.

## Näring och mål

- Kontrollera protein och kalorier i dashboarden.
- Kontrollera kolhydrater och fett.
- Sätt proteinmål och kalorimål.
  - Förväntat: progressindikatorer visas.
- Rensa mål.
  - Förväntat: progressindikatorer för saknade mål visas inte.
- Logga måltider som passerar proteinmålet.
  - Förväntat: texten visar att målet är uppnått utan skuld.

## Måltider och robusthet

- Lägg till måltid med okänd ingrediens, till exempel `kyckling och hemlagad sås`.
  - Förväntat: måltiden visas som delvis analyserad.
- Lägg till en lång måltidstext.
  - Förväntat: texten radbryts utan horisontell scroll.
- Lägg till en framtida måltid.
  - Förväntat: den räknas inte i dagens dashboard.
- Ladda om sidan.
  - Förväntat: sparade måltider finns kvar och dashboarden visar samma siffror.

## Konsistens

- Fråga AI Coach: `Hur mycket protein har jag fått i mig idag?`
  - Förväntat: proteinvärdet matchar dashboarden.
- Fråga AI Coach: `Hur många kalorier har jag fått i mig?`
  - Förväntat: kalorivärdet matchar dashboarden.
- Kontrollera att AI Coach inte sparar chattmåltider automatiskt.
  - Förväntat: dashboarden visar endast sparade måltider.

## Mobilvy

- Testa smal mobilbredd.
  - Förväntat: kort staplas, navigationen fungerar och siffror/text överlappar inte.
