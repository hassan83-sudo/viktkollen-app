# A11Y-8O — AI Coach: kontrast och semantik

Start: `88de935` (efter 8N). Gäller 8M-fynden A-N2, A-N3 och B-N1 i
Mer → AI Coach. 8M-rapporten är historisk och är inte ändrad. Detta dokument
ersätter statusen för de tre fynden.

| Fynd | Status efter 8O |
|---|---|
| A-N2 kontrast | **FIXED** |
| A-N3 `aria-label` på `div` utan roll | **FIXED** |
| B-N1 label in name | **FIXED** |

## A-N2 — kontrast (WCAG 1.4.3, 1.4.11)

Axe hittade 22 serious-noder före 8O, i både standard- och högkontrastläge.
Orsaken var att sektionerna `.achievement-section` (vit med 55 % opacitet)
och `.social-card` (vit med 72 % opacitet) hade kvar en bakgrund från det
ljusa temat. Ovanpå dem låg det mörka temats ljusa text. Det aktiva chipet
hade vit text på `--accent` (#22d3ee).

Värdena nedan är renderade färger i standardläge. Mätningen komponerar alla
bakgrunder och opaciteten på förälderelementen, och före-värdena stämmer med
axe.

| Element | Före | Efter | Krav |
|---|---|---|---|
| Aktivt chip "Alla" | #ffffff på #22d3ee, 1,81:1 | #020617 på #22d3ee, 11,16:1 | 4,5 |
| Inaktivt chip vid hover | #cbd5e1 på #67e8f9, 1,02:1 | #020617 på #a78bfa, 7,41:1 | 4,5 |
| Chipets kant mot sektionen (1.4.11) | 1,66:1 | 8,71:1 | 3 |
| Rubriken "Badges", "Delmål" m.fl. (stor text) | #f8fafc på #92959d, 2,86:1 | #f8fafc på #192335, 15,05:1 | 3 |
| Sektionstext | #cbd5e1 på #92959d, 2,02:1 | 10,6:1 | 4,5 |
| Socialt kort h3 | #f8fafc på #bbbdc2, 1,79:1 | 15,05:1 | 3 |
| Socialt kort p och small | #cbd5e1 på #bbbdc2, 1,26:1 | 10,6:1 | 4,5 |
| Låst badge, text och "Låst" (72 % opacitet) | 4,8:1 | 6,67:1 | 4,5 |

I högkontrastläget var före-värdena 1,81 / 2,99 / 2,43 / 1,87 / 1,52:1. Efter
ändringen är alla minst 6,8:1.

**Fix** (lokal, i `styles/accessibility.css`):
- sektion och socialt kort använder temats `--soft-bg`;
- aktivt chip, och chip vid hover, använder den mörka text som appens egna
  cyanfärgade knappar har.

Ingen palett ändrades, och layouten är oförändrad.

## A-N3 — `aria-label` på `div` utan roll (WCAG 4.1.2, 1.3.1)

**De 37 axe-noderna** kom alla från `ProgressBar` i `AchievementCenter.jsx`.

| Element | Antal | Klass | Efter |
|---|---|---|---|
| Nivåprogress (värdet visas inte som text) | 1 | B: värde | `role="progressbar"`, namnet "Nivåprogress", `aria-valuenow`/`min`/`max` (0–100) |
| Nästa achievement (texten "1 av 3 dagar" står bredvid) | 1 | C: visuell dubblett | `aria-hidden`, inget namn |
| Badge-kortens stapel ("X av Y" står i kortet) | 35 | C: visuell dubblett | `aria-hidden`, inget namn |

**Samma mönster i samma mapp**, utanför axes 37. Axe rapporterar inte `div`
med innehåll, men 8M:s A-N3-rad pekar på filerna. Chromium tappade namnet på
alla fyra:

| Element | Fil | Klass | Efter |
|---|---|---|---|
| "Filtrera achievements" | `AchievementCenter.jsx` | grupp av växlingsknappar | `role="group"` |
| "Förslag på frågor" | `QuickActions.jsx` | grupp av knappar | `role="group"` |
| "Journey-filter" | `HealthJourneyCenter.jsx` | grupp av filterfält | `role="group"` |
| "Härledda trendvärden" | `PredictionCenter.jsx` | grupp av värdekort | `role="group"` |
| "Feedback för …" | `AICoach.jsx` | grupp: säkerhet + två knappar | `role="group"` |

Inget interaktivt element saknade native-semantik (klass A: 0).

## B-N1 — label in name (WCAG 2.5.3)

- **"Markera sedd":** namnet var "Markera Första check-in som sedd", där den
  synliga texten inte ingår sammanhängande. Nu är namnet "Markera sedd: Första
  check-in".
- **Badge-kortets tillstånd:** kort som pågick (t.ex. 1 av 3) lästes upp som
  "upplåst". Nu motsvarar tillståndsordet det kortet visar: "låst", "pågår"
  eller "upplåst".

## Tillgänglighetsträdet i Chromium

| Element | Före | Efter |
|---|---|---|
| Nivåprogress | generic, "Nivåprogress: 20%" (tappades) | progressbar "Nivåprogress", värde 20, 0–100 |
| Badge-stapel | generic, "Första invägningen: 0%" | ignored (dekorativ) |
| Filtergrupp | generic, "Filtrera achievements" | group "Filtrera achievements" |
| Chip "Alla" | button "Alla", pressed=true | oförändrad |
| Pågående badge | article "Tre registrerade dagar, upplåst" | article "Tre registrerade dagar, pågår" |
| Låst badge | article "Första invägningen, låst" | oförändrad |
| Upplåst badge | article "Första check-in, upplåst" | oförändrad |
| "Markera sedd" | button "Markera Första check-in som sedd" | button "Markera sedd: Första check-in" |

## Regressionsskydd

- **`tests/a11y/ai-coach.spec.js`:**
  - kontrast mätt på renderingen (`support/contrast.js`) i standard- och
    högkontrastläge, för chips (aktivt, inaktivt och hover), rubriker,
    badges (låsta och upplåsta), sektionstext och sociala kort, plus en sökning
    över all text;
  - semantik: progressbar, dekorativa staplar, grupper, och inget namngivet
    `generic`-element i hela AI Coach-mappen;
  - label in name för alla badge-kort och alla knappar.
- **`tests/a11y/more-folders.spec.js`:** baseline-posterna för ai-coach
  (`color-contrast`, `aria-prohibited-attr`) är borttagna. AI Coach blockerar
  nu också på moderate.
