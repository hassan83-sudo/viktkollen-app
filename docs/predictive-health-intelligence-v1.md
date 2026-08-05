# Predictive Health Intelligence V1

## Syfte

Predictive Health Intelligence V1 lägger ett försiktigt, regelbaserat prognoslager ovanpå befintlig Viktkollen-arkitektur.

Ingen ny auth, syncmodell, backupmodell, storage key eller databastabell skapas.

## Modul

- `src/services/prediction/healthPredictionEngine.js`
- `src/components/PredictionCenter.jsx`

## Datakällor

Motorn återanvänder:

- Shared Analytics
- Insights
- Nutrition Coach Engine
- Adaptive Coach feedback och action plans
- Health Dashboard-data
- Weekly och Monthly Report-data

## Prognoser

Varje prediction innehåller:

- confidence
- explanation
- contributing factors
- uncertainty

Motorn visar endast prognoser som kan härledas från faktisk aggregerad data. När underlaget är tunt visas hög osäkerhet.

## Early Warnings

Motorn kan identifiera försiktiga stödjande signaler:

- declining adherence
- repeated skipped actions
- missing meals
- inactivity
- decreasing consistency

Detta är inte diagnoser och ska bara visas som vardagligt coachstöd.

## Opportunities

Motorn kan lyfta positiva möjligheter:

- momentum
- improving habits
- stable nutrition
- approaching milestones
- consistent routines

## AI-Gräns

Remote AI får endast se aggregerade prediction summaries, confidence och kategorier när befintligt samtycke finns.

Rå historik, råbilder, authdata och kompletta användardataset skickas inte.

## Lazy Loading

`PredictionCenter` lazy-loadas från `App.jsx` och release-gaten kontrollerar att varken `PredictionCenter` eller `healthPredictionEngine` modulepreloadas initialt.

## Begränsningar

Prognoserna är trendstöd, inte medicinsk rådgivning. De kan inte garantera framtida utfall och ska tolkas försiktigt vid låg datatäckning.
