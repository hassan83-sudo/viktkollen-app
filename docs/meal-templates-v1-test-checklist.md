# Meal Templates & Quick Add V1 testchecklista

## Manuella huvudflöden

- Skapa en ny måltidsmall från Quick Add och kontrollera att den sparas lokalt.
- Lägg till en sparad mall på valt datum och kontrollera att måltiden visas i historik och dashboard.
- Markera och avmarkera en mall som favorit och kontrollera att `aria-pressed` ändras.
- Redigera en mall och kontrollera att befintliga sparade måltider inte ändras.
- Radera en mall och kontrollera att sparade måltider finns kvar.
- Spara en befintlig måltid som mall från måltidshistoriken.
- Lägg till en tidigare måltid igen från listan Senaste måltider.
- Kopiera en tidigare måltid till ett annat datum och en annan tid.

## Datakontroller

- Mallar ska lagras i `viktkollen.mealTemplates`.
- Mallar ska inte räknas i dashboard eller AI Coach innan de används som måltid.
- Näringspreview ska använda `getEffectiveMealNutrition`.
- Manuell näringskorrigering ska kopieras från måltid till mall och från mall till ny måltid.
- Senaste måltider ska vara unika per text och måltidstyp, sorterade nyast först och max fem.
- Framtida och trasiga måltider ska ignoreras i Senaste måltider.

## Robusthet

- Trasig localStorage-JSON ska ge tom mallista utan krasch.
- Ogiltiga tider ska inte sparas som standardtid.
- Negativa eller textbaserade näringsvärden ska stoppas i formuläret.
- Dubbelklick på Lägg till ska inte skapa dubbla måltider.
- UI ska inte visa `NaN`, `undefined`, `null`, `Infinity` eller `[object Object]`.
