# MATSCAN-V2 — smartare och säkrare analys

Bygger på `claude/matscan-accuracy-1` (8a96503). Ingen ny jämförelsestudie. Fortfarande ett
AI-anrop och ett matbanksuppslag per scanning; kamera, kvoter och betalningar är orörda.

## Fanns redan (återanvänt)

- Kort prompt, Livsmedelsverkets matbank med säkra träffar och märkt AI-reserv (MATSCAN-ACCURACY-1).
- Gram per komponent, räkningsbara bitar mot typisk bitvikt, breddning av osäkra intervall och
  tallriksnoteringar (`nutritionPhotoEstimates.js`).
- Omräkning vid gramändring; användarens egna makron skrivs aldrig över.

## Nytt

1. **Portioner (prompt).** Yta × höjd, form och densitet; ingen antagen tallriksstorlek – skalan
   bedöms från flera ledtrådar (bestick, glas, hand, förpackning, kant). Överlappande och delvis
   dold mat räknas bara när den syns eller tydligt framgår, aldrig dubbelt. Kända portioner som
   rimlighetsstöd.
2. **Identifiering (prompt).** Färg, struktur, form, yta och tillagning vägs in före namn.
3. **Rimlighetskontroll (`src/services/nutritionPhotoPlausibility.js`, på servern):**
   - gram mot övre gräns per livsmedelstyp (t.ex. sås 250 g, smör/olja 60 g); orimliga värden sänks
     och märks,
   - saknad mängd för känd livsmedelstyp ger typisk portion, märkt; okänd mat får ingen påhittad mängd,
   - AI:ns värden per 100 g: makrosumma högst 100 g, energin räknas om när den motsäger
     protein/kolhydrater/fett (4/4/9 kcal per g), ovanligt energitäta grönsaker märks,
   - måltidens total är exakt summan av ingredienserna; ovanligt hög total energi noteras.
   Livsmedelsverkets värden och användarens korrigeringar ändras aldrig.
4. **Osäkerhet utan följdfrågor.** Justerade eller osäkra ingredienser markeras som osäkra med en
   kort förklaring. Mängden visas som intervall ("ca 120–160 g") tills användaren själv anger gram.

## Kostnad per scanning

Samma antaganden som MATSCAN-ACCURACY-1 (`gpt-4.1-mini`, 10 SEK/USD, bild 1 280 px ≈ 1 944 tokens).
Prompt 628 → 732 tokens (+0,04 öre). Svarsformatet är oförändrat (~306 tokens för 5 komponenter).

| Tallrik | Kostnad |
| --- | --- |
| 5 komponenter | ca 1,6 öre |
| 10 komponenter | ca 2 öre |

Ingen extra AI-analys görs; kontrollerna körs lokalt på servern utan kostnad.
