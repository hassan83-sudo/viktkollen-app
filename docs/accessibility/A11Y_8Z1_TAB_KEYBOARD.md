# A11Y-8Z1: Flikar och tangentbord

Start: `40d87c4`. `origin/main` står kvar på `462c945` (Cursor, billing).
Det är bara noterat, inget är mergat. Fynden kommer från 8Y
(`A11Y_8Y_POST_8X_FULL_AUDIT.md`).

| Fynd | Före | Efter |
|---|---|---|
| **A-8Y-N1** Stället (`SocialRoom.jsx`) | Roving tabindex (inaktiva flikar hade `tabIndex=-1`), men inga tangenter hanterades. Bara "Stället" gick att nå. "Chatt", "Titta", "Tavlan" och "Spel" krävde mus eller touch. `aria-controls` pekade på paneler som inte fanns i DOM:en. | **FIXED.** Pil höger och pil vänster (med wrap), Home och End. Den valda fliken är det enda Tab-stoppet. `aria-controls` finns bara på den valda fliken och pekar på den panel som faktiskt renderas. |
| **B-8Y-N1** Ekonomi (`EconomyCenter.jsx`) | Alla 6 flikar var Tab-stopp. Piltangenterna gjorde ingenting. `aria-controls`, id och `tabpanel` saknades. | **FIXED.** Samma mönster som Stället. Flikarna har id `economy-tab-*`. Panelerna ligger i en gemensam `role="tabpanel"` (`#economy-tabpanel`) som namnges av den valda fliken. |
| **C-8Y-N3** inget tangentbordstest för flikar | – | **FIXED.** Nytt `tests/a11y/tabs-keyboard.spec.js`, och `useRovingTabs.test.js` |

## Tangentbord

`src/components/a11y/useRovingTabs.js` är en liten gemensam hook med
`nextTabForKey` och `useRovingTabs`. Det finns ingen större refaktorering.

| Tangent | Effekt |
|---|---|
| Tab | Går in i fliklistan **en gång**, till den valda fliken. Nästa Tab går vidare till innehållet efter listan. |
| Shift+Tab | Tillbaka till den valda fliken |
| Pil höger och pil vänster | Nästa och föregående flik. Från sista går den till första, och från första till sista. |
| Home och End | Första och sista fliken |

**Aktivering:** fliken väljs när den får fokus (automatisk aktivering). Det
följer appens modell, där klick redan väljer fliken. Fokus flyttas till den
nya fliken, och `tabIndex=0` och `aria-selected` följer med. Mus och touch
fungerar som förut.

## ARIA

| Del | Attribut |
|---|---|
| Lista | `role="tablist"` med namn: "Stället"-flikarna har `room.tabsAria`, Ekonomi har `tabs.aria` |
| Flik | `role="tab"`, `aria-selected`, `id`, `tabIndex` 0 eller -1 |
| Relation | `aria-controls` från den valda fliken till panelen |
| Panel | `role="tabpanel"`, `aria-labelledby` den valda flikens id |

`.economy-tabpanel` får `min-width: 0` (`styles/accessibility.css`), så att
omslaget krymper som panelerna i Ekonomis grid.

## Tester

- **`tests/a11y/tabs-keyboard.spec.js`**, nytt, 2 tester i Chromium. Samma
  kontrakt körs för Stället och Ekonomi:
  - exakt en vald flik, som också är det enda Tab-stoppet;
  - `aria-controls` pekar på en `tabpanel` som namnges av fliken;
  - pil höger, pil höger, pil vänster, End, pil höger (wrap till första), pil
    vänster (wrap till sista) och Home. Efter varje steg kontrolleras fokus,
    `aria-selected`, Tab-stoppet och relationen till panelen;
  - alla flikar nås med tangentbordet;
  - Tab lämnar listan och Shift+Tab kommer tillbaka;
  - fokus är synligt, aldrig på `<body>`, och fastnar inte;
  - klick fungerar och flyttar Tab-stoppet;
  - panelens innehåll följer fliken (Stället "Chatt", Ekonomi "Köp");
  - Ekonomi vid 320 px: ingen sidledsscroll i flikarna, med ett känt undantag
    (se nedan);
  - axe med critical, serious och moderate: 0 för båda.
- **`src/components/a11y/useRovingTabs.test.js`**, 2 tester (ingår i
  `test:a11y`, som nu är 504): pilar, wrap, Home och End, och andra tangenter.
- **Regressioner:** 91 av 91 godkända. De täcker `more-folders` (alla mappar),
  `semantics-8v`, `forced-colors`, `axe-views`, `focus-visibility` och
  `high-contrast`. Komponenttesterna för social och ekonomi har inga nya fel;
  de 3 fel som visas finns redan i baslinjen.
- **Negativt bevis:** utan pil höger faller testet för Stället ("social:
  ArrowRight", förväntat "Chatt", fick "Stället"). Det är återställt.

**Inte körda:** hela `test:a11y:e2e` och hela Vitest, eftersom checkpointen i
8Y var grön.

## Nytt fynd (inte åtgärdat, utanför sprinten)

**B-8Z1-N1:** Ekonomi, fliken "Översikt", scrollar 25 px i sidled vid 320 px
(1.4.10). Det är identiskt med och utan tabpanel-omslaget, så det fanns före
8Z1. Mer-gaten upptäckte det inte, eftersom den bara ser aktiveringsvyn.

Det ligger som ett känt undantag i `tabs-keyboard.spec.js`, med en kontroll som
faller när felet är åtgärdat. Förslaget är att ta det i 8Z3, tillsammans med
Ekonomis tabell (C15).
