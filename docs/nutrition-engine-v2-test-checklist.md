# Nutrition Engine V2 - manuell testchecklista

Testa i webbläsaren utan att ändra UI-flödet.

## Chattfrågor

- Fråga: `Jag åt 250 g kyckling.`
  - Förväntat: AI Coach nämner ungefärligt protein och kcal.
- Fråga: `Jag åt två ägg och två skivor bröd.`
  - Förväntat: AI Coach identifierar både ägg och bröd.
- Fråga: `Jag åt 200 g kyckling, 150 g ris och broccoli.`
  - Förväntat: AI Coach summerar sammansatt måltid och nämner proteinrik måltid.
- Fråga: `Jag åt två hamburgare, pommes och läsk.`
  - Förväntat: AI Coach beskriver måltiden som större/energität utan skuld och ger nästa steg.
- Fråga: `Jag åt 200 g kyckling och hemlagad sås.`
  - Förväntat: Kyckling räknas, såsen markeras som okänd eller ej medräknad.

## Dagens intag

- Lägg till dagens måltider i appen, till exempel frukost och lunch.
- Fråga: `Hur mycket protein har jag ätit idag?`
  - Förväntat: AI Coach använder dagens loggade måltider och proteinmål om det finns.
- Fråga: `Hur många kalorier har jag fått i mig?`
  - Förväntat: AI Coach summerar dagens analyserbara måltider.
- Fråga: `Hur mycket protein har jag kvar?`
  - Förväntat: AI Coach jämför mot proteinmål när det finns.
- Fråga: `Hur såg min lunch ut?`
  - Förväntat: AI Coach analyserar lunchmåltiden om den finns loggad.

## Datakontroller

- Lägg till en framtida måltid och fråga om dagens intag.
  - Förväntat: framtida måltid räknas inte.
- Uppdatera sidan.
  - Förväntat: loggade måltider finns kvar och dagens summering använder dem.
- Testa en måltid med okänt livsmedel.
  - Förväntat: appen kraschar inte och visar inte `NaN`, `undefined`, `null` eller råa fel.
