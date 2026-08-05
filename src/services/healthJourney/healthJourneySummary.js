import { buildHealthJourney } from './healthJourneyBuilder.js'

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function firstBy(events, predicate) {
  return safeArray(events).find(predicate) || null
}

function phaseFromJourney(journey) {
  if (!safeArray(journey.events).length) return 'Startfas'
  if (journey.coverage < 25) return 'Datainsamling'
  if (journey.confidence >= 70 && journey.aggregation?.milestones?.length) return 'Stabil utveckling'
  if (safeArray(journey.events).some((event) => event.tone === 'caution')) return 'Varsam justering'
  return 'Bygga rutin'
}

function focusFromJourney(journey) {
  const caution = firstBy(journey.events, (event) => event.tone === 'caution')
  if (caution) return caution.summary
  const nutritionGap = firstBy(journey.events, (event) => event.type === 'nutritionGap')
  if (nutritionGap) return nutritionGap.summary
  const neutral = firstBy(journey.events, (event) => event.tone === 'neutral')
  return neutral?.summary || 'Samla lite mer data och välj ett litet nästa steg.'
}

export function buildHealthJourneySummary(input = {}, options = {}) {
  const journey = input.events && input.aggregation ? input : buildHealthJourney(input, options)
  const events = safeArray(journey.events)
  const positive = firstBy(events, (event) => event.tone === 'positive')
  const caution = firstBy(events, (event) => event.tone === 'caution')
  const opportunity = firstBy(events, (event) => event.type === 'opportunityDetected' && event.tone !== 'caution')
  const recentMilestone = safeArray(journey.aggregation?.milestones)[0] || firstBy(events, (event) =>
    ['achievementUnlocked', 'habitMilestone', 'coachActionCompleted'].includes(event.type))
  const prediction = firstBy(events, (event) => event.type === 'predictionChanged')
  const limitations = safeArray(journey.limitations)

  return {
    confidence: journey.confidence || 0,
    currentCautionSignal: caution
      ? caution.summary
      : 'Ingen tydlig caution-signal just nu.',
    currentOpportunity: opportunity
      ? opportunity.summary
      : 'Möjligheter visas när flera säkra signaler stödjer dem.',
    currentPhase: phaseFromJourney(journey),
    dataCoverage: journey.coverage || 0,
    eventCount: events.length,
    limitations: limitations.length ? limitations : ['Journey bygger endast på befintlig appdata och visar inte medicinska slutsatser.'],
    mainCurrentFocus: focusFromJourney(journey),
    predictionSummary: prediction
      ? prediction.summary
      : 'Prognos visas först när prediction engine har tillräcklig täckning.',
    recentMilestone: recentMilestone
      ? recentMilestone.summary
      : 'Milstolpar visas när befintliga achievement-, coach- eller målmodeller bekräftar dem.',
    strongestPositiveTrend: positive
      ? positive.summary
      : 'Ingen tydlig positiv trend ännu. Det är neutralt och kan bero på begränsad data.',
    text: events.length
      ? `${phaseFromJourney(journey)}: ${focusFromJourney(journey)}`
      : 'Health Journey behöver mer data innan den kan sammanfattas tryggt.',
  }
}

export function buildHealthJourneyReportSummary(input = {}, options = {}) {
  const journey = buildHealthJourney(input, options)
  const summary = buildHealthJourneySummary(journey)

  return {
    confidence: summary.confidence,
    coverage: summary.dataCoverage,
    currentPhase: summary.currentPhase,
    caution: summary.currentCautionSignal,
    keyEvent: journey.events[0]?.summary || 'Inget tydligt journey-event ännu.',
    limitations: summary.limitations,
    milestone: summary.recentMilestone,
    opportunity: summary.currentOpportunity,
    predictedDirection: summary.predictionSummary,
    summary: summary.text,
  }
}
