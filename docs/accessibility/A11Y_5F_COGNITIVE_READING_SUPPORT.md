# A11Y-5F: Kognitivt stöd och läsning

## Avgränsad audit

Auditen omfattade Tillgänglighet & hjälpmedel, Tal & kommunikation, de lokala tillgänglighetsinställningarna och synlig statusåterkoppling. De konkreta förbättringarna gäller bara denna yta: en kort, valfri kommunikationsguide och tydligare meddelanden när uppläsning avslutas, misslyckas eller saknas.

## Klarspråk och enhetliga ord

Texter är korta, konkreta och beskriver nästa steg. Samma handling heter `Läs upp` i kommunikationsstödet. `Stoppa` avbryter uppläsning. När uppläsning inte går att använda berättar statusen vad som hände och att texten fortfarande kan visas och läsas. Viktig status visas med text och den befintliga lugna, semantiska statusytan; den bygger inte på färg eller ikon.

## Valfri stegvis hjälp

Tal & kommunikation har den hopfällbara hjälpen **Så använder du stödet**:

1. Välj en fras eller skriv en kort mening.
2. Välj Visa stort eller Läs upp.
3. Välj Stoppa för att avbryta uppläsningen.

Hjälpen är stängd från början och öppnas bara när användaren väljer den. Den startar aldrig uppläsning, navigering, återställning eller tidgräns. Man kan frivilligt välja `Läs upp hjälp`; den använder samma lokala webbläsar-TTS och samma Stoppa/status som annan manuell uppläsning.

## Förutsägbarhet, läsning och användarkontroll

Hubben behåller synliga områden och återför fokus till kortet efter Tillbaka. Den stora textvyn får fokus på Stäng stor text, Escape stänger den och fokus återgår till Visa stort. Snabbfraser fyller endast redigeringsfältet och läser aldrig upp automatiskt. Uppläsning av privat kommunikation förblir helt manuell; den valfria hjälpen innehåller endast fast, lokal hjälptxt.

Den befintliga lokala inställningen `Enklare texter` används redan för läsförhandsvisningen. En parallell ny textvariant skulle dubblera översättningar utan ytterligare värde, så den har inte lagts till. Tät information delas i rubriker, korta stycken och den valfria guiden utan att dölja kritisk information.

## Tillgänglighet och integritet

Alla viktiga åtgärder har textetiketter och vanliga knappar, med befintlig tangentbordsordning, synligt fokus, hög kontrast, reducerad rörelse, stor text och responsiv enkolumnslayout vid 390/430 px. Statusytor använder `role="status"` med `aria-live="polite"` och samma meddelande dedupliceras av den befintliga återkopplingsstrategin.

Ingen diagnos, kognitiv- eller läsprofil lagras. Kommunikationstext och ångra-data stannar i komponentens minne och sparas inte i webbläsaren eller på servern. Ingen extern AI, textanalys, mikrofon, kamera, inspelning eller nätverksanrop används.

## Icke-mål och kvarvarande luckor

Detta är inte en diagnos, personlig läsbedömning, appomfattande förenkling eller automatisk siduppläsning. Manuell visuell kontroll vid 200 % zoom kräver fortfarande en riktig webbläsare.

Nästa rekommenderade steg är **A11Y-5G: samlad A11Y UX- och säkerhetsgranskning**. Det ingår inte i denna sprint.
