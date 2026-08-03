import { buildAdaptiveCoach } from './adaptiveCoachEngine.js'
import { buildAdaptiveCoachPatternSummary, sanitizeCoachPatternText } from './adaptiveCoachPatterns.js'
import { buildCoachActionSummary } from './adaptiveCoachActions.js'
import { buildAdaptiveCoachFeedbackSummary } from './adaptiveCoachFeedback.js'
import { buildAdaptiveCoachTimelineSummary } from './adaptiveCoachTimeline.js'

export const adaptiveCoachStrategyTypes = [
  'reinforceSuccess',
  'simplifyAction',
  'improveCoverage',
  'continueActiveAction',
  'suggestWeeklyFocus',
  'suggestReminder',
  'suggestHabit',
  'waitForMoreData',
  'rotateCategory',
]

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeText(value, fallback = '', max = 260) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max)
}

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min

  return Math.min(max, Math.max(min, number))
}

function uniqueRecommendations(items) {
  const seen = new Set()

  return safeArray(items)
    .filter((item) => item?.title && item?.action)
    .filter((item) => {
      const key = `${item.title}|${item.action}|${item.category || item.area}`.toLocaleLowerCase('sv-SE')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 3)
}

function createStrategyRecommendation(source = {}) {
  return {
    action: sanitizeCoachPatternText(source.action || 'Välj ett litet nästa steg.'),
    category: safeText(source.category || source.area || 'general'),
    id: safeText(source.id || `strategy-${source.category || source.area || 'general'}-${source.title}`),
    reason: sanitizeCoachPatternText(source.reason || source.text || 'Valt från registrerad data.'),
    title: sanitizeCoachPatternText(source.title || 'Nästa steg'),
  }
}

function selectStrategy({ actionSummary, coachModel, feedbackSummary, patternSummary, timelineSummary }) {
  const primaryPattern = patternSummary.primaryPattern
  const hasActive = actionSummary.total > 0 || feedbackSummary.activeCount > 0 || timelineSummary.activeActions > 0
  const lowCoverage = coachModel.coverage.ratio < 0.25 || patternSummary.coverage.ratio < 0.2

  if (timelineSummary.positiveOutcome || feedbackSummary.completed >= 2) return 'reinforceSuccess'
  if (hasActive) return 'continueActiveAction'
  if (feedbackSummary.dismissed > feedbackSummary.accepted + feedbackSummary.completed) return 'simplifyAction'
  if (lowCoverage) return 'improveCoverage'
  if (primaryPattern?.eligibility === 'supported' && primaryPattern.category === 'reminders') return 'suggestReminder'
  if (primaryPattern?.eligibility === 'supported' && primaryPattern.patternType === 'consistency') return 'suggestHabit'
  if (primaryPattern?.eligibility === 'supported' || primaryPattern?.eligibility === 'tentative') return 'suggestWeeklyFocus'
  if (coachModel.recommendations.length) return 'rotateCategory'

  return 'waitForMoreData'
}

function titleFor(strategy) {
  return {
    continueActiveAction: 'Fortsätt med aktiv action',
    improveCoverage: 'Bygg bättre underlag',
    reinforceSuccess: 'Förstärk det som fungerar',
    rotateCategory: 'Variera coachfokus',
    simplifyAction: 'Gör nästa steg enklare',
    suggestHabit: 'Föreslå en vana',
    suggestReminder: 'Föreslå en reminder',
    suggestWeeklyFocus: 'Föreslå veckofokus',
    waitForMoreData: 'Vänta på mer data',
  }[strategy] || 'Coachstrategi'
}

function explanationFor(strategy, context) {
  const patternText = context.patternSummary.primaryPattern?.textualSummary || 'Underlaget är begränsat.'

  return sanitizeCoachPatternText({
    continueActiveAction: 'Det finns redan en aktiv coachaction, så nästa stöd bör följa upp den innan nya råd läggs till.',
    improveCoverage: 'Datatäckningen är begränsad, så coachen prioriterar tryggare registreringsunderlag.',
    reinforceSuccess: 'Coachhistoriken visar positiva outcomes, så nästa stöd kan förstärka samma typ av små steg.',
    rotateCategory: 'Liknande råd har nyligen förekommit, så coachen varierar kategori för att undvika upprepning.',
    simplifyAction: 'Flera råd har skjutits upp eller avfärdats, så nästa förslag bör vara mindre och lättare att välja bort.',
    suggestHabit: `${patternText} Därför passar ett litet vaneutkast bättre än ett stort mål.`,
    suggestReminder: `${patternText} Därför kan en neutral reminder vara relevant om användaren vill.`,
    suggestWeeklyFocus: `${patternText} Därför passar ett redigerbart veckofokus.`,
    waitForMoreData: 'Underlaget är ännu för litet för ett personligt mönster, så coachen väntar hellre än gissar.',
  }[strategy])
}

export function buildAdaptiveCoachStrategy(input = {}, options = {}) {
  const now = options.now || (options.analysisDate ? `${options.analysisDate}T12:00:00.000Z` : undefined)
  const coachModel = input.coachModel || buildAdaptiveCoach(input, { analysisDate: options.analysisDate, now, period: options.period || '30d' })
  const patternSummary = input.patternSummary || buildAdaptiveCoachPatternSummary(input, { analysisDate: coachModel.analysisDate, days: 30, now })
  const feedbackSummary = buildAdaptiveCoachFeedbackSummary(input.adaptiveCoachFeedback, { now })
  const actionSummary = buildCoachActionSummary(input.adaptiveCoachFeedback)
  const timelineSummary = buildAdaptiveCoachTimelineSummary(input, {
    analysisDate: coachModel.analysisDate,
    filter: { period: '30d' },
    now,
  })
  const strategy = selectStrategy({ actionSummary, coachModel, feedbackSummary, patternSummary, timelineSummary })
  const recommendations = uniqueRecommendations([
    strategy === 'continueActiveAction' && actionSummary.latestAction
      ? createStrategyRecommendation({
        action: 'Följ upp den aktiva actionen innan du lägger till fler.',
        category: actionSummary.latestAction.linkedEntityType || 'coachActions',
        id: 'strategy-continue-active-action',
        reason: actionSummary.latestAction.title,
        title: 'Följ upp aktiv action',
      })
      : null,
    patternSummary.primaryPattern && patternSummary.primaryPattern.eligibility !== 'insufficient'
      ? createStrategyRecommendation({
        action: patternSummary.primaryPattern.recommendedResponse,
        category: patternSummary.primaryPattern.category,
        id: `strategy-pattern-${patternSummary.primaryPattern.id}`,
        reason: patternSummary.primaryPattern.textualSummary,
        title: 'Använd observerat mönster',
      })
      : null,
    ...safeArray(coachModel.recommendations).map((item) => createStrategyRecommendation({
      ...item,
      category: item.area,
      id: `strategy-coach-${item.id}`,
      reason: item.text,
    })),
  ])
  const confidence = clamp((coachModel.confidence.value + (patternSummary.primaryPattern?.confidence || 0.2)) / 2, 0, 0.95)
  const coverage = clamp((coachModel.coverage.ratio + patternSummary.coverage.ratio) / 2, 0, 1)

  return {
    confidence: Number(confidence.toFixed(2)),
    coverage: Number(coverage.toFixed(2)),
    evidence: [
      patternSummary.primaryPattern?.textualSummary,
      feedbackSummary.weeklyStatus,
      timelineSummary.latestEvent?.summary,
    ].filter(Boolean).map((item) => sanitizeCoachPatternText(item)).slice(0, 4),
    explanation: explanationFor(strategy, { actionSummary, coachModel, feedbackSummary, patternSummary, timelineSummary }),
    recommendations,
    safetyNote: 'Strategin beskriver hur appen väljer stöd. Den tolkar inte personlighet, hälsa eller framtida beteende.',
    strategy,
    title: titleFor(strategy),
  }
}
