# MATSCAN-ACCURACY-1 — träffsäkrare och billigare matscanning

Branch: `claude/matscan-accuracy-1`. Bygger vidare på MATSCAN-OPT-1 (kort prompt utan
näringsberäkning i AI:n) och food bank-grunden (`nutrition_food_bank`, importer, klientuppslag).
Ingen ny jämförelsestudie har gjorts.

## Fanns redan (återanvänt)

- `public.nutrition_food_bank` med Livsmedelsverkets värden, importer och klientens
  uppslag (`src/services/nutritionFoodBank.js`) med förslag i granskningen.
- Komponentbaserad analys, normalisering och sammanslagning (`nutritionPhotoEstimates.js`).
- Användarens möjlighet att ändra gram, makron och välja databasförslag.
- Ett AI-anrop per scanning, kvoter och billing (`food.scan`, quantity 1) – oförändrat.

## Ändrat

1. **Kort prompt (MATSCAN-OPT-1 i produktion).** AI:n returnerar bara identitet, ett namn i
   Livsmedelsverkets stil inkl. tillagning, gram per komponent, säkerhet, alternativ och ett
   kompakt reservvärde per 100 g. 1 289 → 628 prompt-tokens (o200k).
2. **Identifiering.** Uttryckliga kontroller kyckling/fisk (fibrer, flagor, skinn), fläsk/kyckling,
   nöt/lamm, ris/bulgur/couscous, potatis/sötpotatis, gräddsås/yoghurtsås. Säkerhet "high"
   endast när det är otvetydigt; annars alternativ och osäkerhetsflagga i granskningen.
   Varje sås, fett, bröd och panering är egen komponent; inga dolda ingredienser.
3. **Gram per ingrediens.** Separat intervall per komponent utifrån yta, höjd, densitet och
   tallrik/bestick; räkningsbara bitar räknas bara om de syns.
4. **Matbanken på servern.** Efter AI-svaret görs ett enda PostgREST-anrop mot
   `nutrition_food_bank` med användarens session (RLS). `nutritionFoodBankMatcher.js` väljer
   en träff endast när huvudlivsmedlet står först, tillagningen inte motsäger bilden, ingen
   annan kandidat med annan energi är lika bra, energitätheten är rimlig och identiteten inte
   är osäker. Annars används AI:ns reservvärde, märkt som AI-uppskattning.
5. **Gramkorrigering.** Ändrar användaren gram räknas makron om från samma värde per 100 g
   (databas eller märkt AI-reserv). Egna makron skrivs aldrig över. Måltidens summa följer
   ingredienserna tills användaren själv bekräftat totaler.
6. **Kostnad.** Max utdata 3 400 → 1 400 tokens; typiskt svar 818 → 306 tokens.
   Bild 1920 → 1280 px (modellen skalar ändå ner till ca 1440 px).

## Uppskattad kostnad per scanning

Antaganden (samma som `scripts/compare-food-scan-cost.mjs`): `gpt-4.1-mini` 0,40 USD/M in,
1,60 USD/M ut, 10 SEK/USD. Bild-tokens enligt patch-modellen för 4.1-mini (32 px, max 1 536,
×1,62). Typisk tallrik med 5 komponenter.

| | Bild | Prompt | Svar | Kostnad |
| --- | --- | --- | --- | --- |
| Före | ~2 490 | 1 289 | ~818 | ~2,8 öre |
| Efter | ~1 944 | 628 | ~306 | ~1,5 öre |

Större tallrik (10 komponenter): ca 2 öre. Matbanksuppslaget kostar ingen AI.
Under 1 öre skulle kräva mindre bild (ca 768 px) eller en billigare modell – inte gjort,
eftersom träffsäkerheten prioriteras. Verklig förbrukning syns i `usage_events`.

## Återstår

- Verifiera matchningen mot de riktiga 2 606 raderna i Preview (Livsmedelsverkets API och
  databasen var inte nåbara från utvecklingsmiljön; testerna använder representativa rader).
- Riktiga testbilder i Preview, särskilt MATSCAN-OPT-1-bilderna (kyckling, inte fisk).
- Bekräfta verklig tokenförbrukning per scanning i `usage_events` efter Preview-test.
