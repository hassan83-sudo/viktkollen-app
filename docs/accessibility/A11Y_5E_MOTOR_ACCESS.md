# A11Y-5E: Motorik och åtkomst med begränsad precision

## Avgränsad audit

Auditen omfattade endast Tillgänglighet & hjälpmedel och detaljvyn Tal & kommunikation. Hub-korten, inställningsknapparna, snabbfraserna, Läs upp, Stoppa, Visa stort, Rensa, Stäng stor text och Tillbaka använder vanliga knappar. Det finns inga krav på svepning, dragning, långtryck, dubbeltryck, multi-touch eller pek-/hover-interaktion i denna yta. Ingen kort tidsgräns eller auto-stängning används för att skriva, läsa eller rätta kommunikationstext.

## Tryckytor och avstånd

Alla knappar inom hubben och detaljvyerna får nu minst 44 CSS-px höjd. Snabbfraserna behåller 52 px minsta höjd. Avståndet mellan kommunikationsåtgärder är 12 px för att skilja Läs upp, Stoppa, Visa stort och Rensa. Textfältets storlek styrs av användaren och förblir ett vanligt textarea-fält.

Det finns ingen separat inställning för `Större tryckytor`: den befintliga motorikinställningen `Större knappar och tryckytor` utökar redan berörda kontroller, och den nya basnivån gör ytterligare en parallell inställning överflödig. Undantag är ren, icke-interaktiv status- och förklarande text.

## Oavsiktlig aktivering och kommunikation

`Rensa` kan ta bort ett lokalt meddelande. Efter rensning visas därför den lokala knappen `Ångra rensning`, som återställer texten i samma React-state. Varken meddelandet eller ångra-data lagras i webbläsarens lagring eller skickas över nätverket. Snabbfraser fyller fortfarande endast redigeringsfältet och startar aldrig uppläsning automatiskt. `Ring min kontakt` är fortsatt en textfras utan samtals- eller meddelandefunktion.

## Tangentbord och fokus

Kontrollerna är inbyggda `button`- och `textarea`-element med normal Tab/Shift+Tab-ordning och Enter/Space-stöd. Ingen `tabindex` över noll eller tangentbordsfälla används. Den stora textvyn är en inline-vy, inte en modal: dess Stäng stor text-knapp får fokus vid öppning, Escape stänger vyn och fokus återgår till Visa stort. Återgång från en hubbdetalj återställer fokus till öppningskortet. Befintlig synlig fokusmarkering fungerar även i hög kontrast, stor text och reducerad rörelse.

## En hand, skala och mobil

Kontrollerna kan användas med en hand utan samtidiga eller flerfingrade gester. De responsiva enkolumnslayouterna för 390 och 430 px används för snabbfraser och inställningar; lång text bryts säkert i stor text-vyn. Stor text, hög kontrast och reducerad rörelse behålls utan att animation krävs. CSS-granskning täcker skalningsgrunden; ingen visuell webbläsaremulator finns i denna arbetsyta för manuell 200%-granskning.

## Integritet och icke-mål

Ingen medicinsk profil, kamera, blick-/ansiktsspårning, gestigenkänning, mikrofon, röststyrning, taligenkänning, extern hårdvara, extern AI eller extern tjänst har lagts till. Den befintliga lokala webbläsar-TTS:en, synliga statusåterkopplingen och navigationsuppläsningens uttryckliga opt-in bevaras.

## Kvarvarande omfattning

Nästa rekommenderade steg är **A11Y-5F: bedömning av kognitivt och läsrelaterat stöd**. Det ingår inte i denna sprint.
