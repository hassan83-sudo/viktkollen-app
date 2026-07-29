# Smart Progress Dashboard V2 Test Checklist

## Datakällor

- Vikt: befintlig viktlogg och profilens start-/målvikt.
- Faktisk nutrition: registrerade måltider och nutrition goals.
- Planerad nutrition: Weekly Meal Planner och AI Meal Generator.
- Vanor: matchecklistan i appens befintliga `foods`-data.
- Check-ins: befintlig check-in-data och eventuell check-in-historik.
- Veckosammanfattning: befintlig veckorapportdata.

## Periodlogik

- Perioder: 7 dagar, 30 dagar, 90 dagar och hela perioden.
- Slutdatum är dagens lokala datum.
- 7/30/90 dagar jämförs med närmast föregående lika lång period.
- Hela perioden har ingen föregående-period-jämförelse.

## Faktisk Kontra Planerad Nutrition

- Faktiskt intag räknas bara från registrerade måltider.
- Planerade måltider visas separat som planering.
- AI-genererade planer visas som planeringsunderlag och räknas inte som faktisk konsumtion.

## Vikttrend

- Ogiltiga, framtida och orimliga viktposter filtreras bort.
- Förändring beräknas från första till senaste giltiga vikt i perioden.
- Veckogenomsnitt räknas från förändring delad över antal dagar och multiplicerad med 7.
- En enda registrering ger otillräcklig trend.

## Prognosregler

- Prognos kräver aktuell vikt, målvikt och minst tre giltiga viktposter över minst 14 dagar.
- Orimlig takt filtreras bort.
- Prognosen visas som riktning, inte löfte.
- Om trenden inte går mot målet visas neutral osäkerhet.

## Föregående Period

- Jämför måltidsloggning, målprocent, träning, check-ins och viktförändring.
- Saknad jämförelsedata visas neutralt.

## AI Coach

Coachfrågor använder samma progressAnalytics/progressForecast-data som dashboarden:

- min utveckling
- min vikttrend
- min målprognos
- mitt genomsnittliga protein
- kalorimåluppfyllelse
- hur ofta jag tränat
- mina check-ins
- mina vanor
- föregående period
- viktigaste framstegsinsikten

## Tomlägen

- Ingen viktdata: visa att mer data behövs.
- Ingen nutrition: visa Saknas eller 0 där det är tydligt.
- Ingen prognos: förklara att underlaget är otillräckligt.
- Inga insikter: visa neutralt tomläge.

## Robusthet

Manuella testfall:

- Trasig eller saknad localStorage för planner och AI-generator.
- Ogiltiga datum i vikt, måltider och check-ins.
- Framtida viktposter.
- Duplicerade check-ins samma dag.
- Flera viktposter samma dag.
- Tom profil, tom viktlogg, tom måltidslista.
- Stora måltidslistor.

## UI Och Tillgänglighet

- Periodknappar ska ha `aria-pressed`.
- Dashboarden ska fungera smalt på mobil utan tabeller som svämmar över.
- Positiv/neutral/osäker status ska även uttryckas i text, inte bara färg.
- Faktisk och planerad nutrition ska vara tydligt separerade i text.
