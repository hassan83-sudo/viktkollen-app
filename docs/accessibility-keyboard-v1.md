# Accessibility & Keyboard Navigation V1

Den här sprinten låser grundreglerna för Viktkollens tillgänglighet utan att ändra UI-layouten.

## Grundkontrakt

- Dokumentet deklarerar svenska med `lang="sv"`.
- Interaktiva element i huvudflöden ska vara riktiga `button`, `input`, `select`, `textarea` eller länkar.
- Segmenterade vyväljare använder `aria-pressed` och pekar på aktiv vy när en vyregion finns.
- Ikon- och filflöden ska ha maskinellt namn via synlig text, label eller `aria-label`.
- Status efter import, export, kopiering, generering och sync ska exponeras med `role="status"` och `aria-live`.
- Valideringsfel ska kopplas till fält med `aria-invalid` och `aria-describedby`.
- Progressindikatorer för nutrition ska använda `role="progressbar"` med säkra `aria-valuemin`, `aria-valuemax`, `aria-valuenow` och `aria-valuetext`.
- Fokusringar ska vara synliga för knappar, länkar och formulärfält, inklusive `textarea`.

## Tangentbord

Alla granskade åtgärder använder riktiga knappar eller formulärfält och är därför nåbara med Tab, Shift+Tab, Enter och Space enligt webbläsarens standardbeteende. Vyer som Dag, Vecka, Månad, Planera, AI-plan och Recept behåller knappbeteendet och markerar aktivt läge med `aria-pressed`.

## Fel Och Status

Formulär visar användartext i appen, medan maskinella attribut beskriver samma fel för hjälpmedel. Live-regioner används bara för kort statusfeedback så stora dashboardsektioner inte läses upp i onödan.

## Saker Konsumenter Inte Ska Göra

- Skapa klickbara `div` eller `span` i nya huvudflöden.
- Visa status endast visuellt utan live-region.
- Rendera progress som en anonym div när värdet beskriver målprogress.
- Visa tekniska aria-labels, råa booleans eller interna nycklar som användartext.
