import { getRecentAiConversation } from './aiConversationMemory.js'
import { createAiFallback } from './aiFallbackEngine.js'
import { requestAiEndpoint } from './aiApiService.js'
import { buildAiUserContext } from './aiUserContext.js'
import { normalizeCheckInMetrics } from './checkInNormalization.js'
import { formatSteps } from './healthFormatting.js'
import { buildHealthSnapshot } from './healthSnapshot.js'
import { buildGoalsHabitsLiteSummary } from './goalsHabitsSummary.js'
import { buildSharedWeeklyReportModel } from './sharedAnalyticsEngine.js'
import { buildAdaptiveCoachFeedbackSummary } from './adaptiveCoachFeedback.js'
import { buildCoachActionSummary } from './adaptiveCoachActions.js'
import { buildAdaptiveCoachTimelineSummary } from './adaptiveCoachTimeline.js'

function getMealPattern(mealHistory = [], meals = []) {
  if (mealHistory.length > 0) {
    return `${mealHistory.length} fotoanalyser ger bättre bild av matmönstret.`
  }

  if (meals.length > 0) {
    return `${meals.length} måltidsnoteringar är loggade.`
  }

  return 'Matmönstret blir tydligare när du loggar fler måltider.'
}

function hasStatus(history = [], key, keywords) {
  const text = history
    .map((entry) => entry.analysis?.[key] || '')
    .join(' ')
    .toLocaleLowerCase('sv-SE')

  return keywords.some((keyword) => text.includes(keyword))
}

/**
 * Builds a local weekly report fallback from app data.
 *
 * @param {object} data
 * @returns {object}
 */
export function makeWeeklyReportFallback(data) {
  const snapshot = data.healthSnapshot || buildHealthSnapshot(data)
  const sharedReport = buildSharedWeeklyReportModel({
    ...data,
    healthSnapshot: snapshot,
  }, { analysisDate: data.today })
  const userContext = buildAiUserContext(data)
  const aiFallback = createAiFallback({
    feature: 'weeklyReport',
    userContext,
  })
  const checkInMetrics = snapshot.checkIn.metrics || normalizeCheckInMetrics(data.checkIn)
  const steps = checkInMetrics.steps
  const energy = checkInMetrics.energy.value
  const mealHistory = snapshot.nutrition.actualMeals || data.mealHistory || []
  const hasProtein = hasStatus(mealHistory, 'proteinStatus', ['protein'])
  const hasVegetables = hasStatus(mealHistory, 'vegetableStatus', [
    'grön',
    'frukt',
    'sallad',
  ])
  const proactiveRisk = data.proactiveCoach?.dailyRisk
  const proactiveAction = data.proactiveCoach?.nextBestAction
  const goalsHabitsSummary = buildGoalsHabitsLiteSummary(data.goalsHabits)
  const coachFeedback = buildAdaptiveCoachFeedbackSummary(data.adaptiveCoachFeedback, {
    now: data.today ? `${data.today}T12:00:00.000Z` : undefined,
  })
  const coachActions = buildCoachActionSummary(data.adaptiveCoachFeedback)
  const coachTimeline = buildAdaptiveCoachTimelineSummary(data, {
    analysisDate: data.today,
    filter: { period: '7d' },
    now: data.today ? `${data.today}T12:00:00.000Z` : undefined,
  })

  return {
    biggestProgress:
      sharedReport.highlights[0]?.text ||
      (mealHistory.length > 0
        ? 'Du har börjat skapa tydligare matdata med fotoanalyser.'
        : 'Du har samlat data som gör nästa vecka lättare att styra.'),
    biggestRisk:
      sharedReport.attentionItems[0]?.text ||
      proactiveRisk ||
      (energy <= 3
        ? 'Låg energi kan göra kvällsrutinen svårare.'
        : 'Risken är att nästa steg blir för stort i stället för upprepbart.'),
    focusNextWeek:
      sharedReport.attentionItems[0]?.action || goalsHabitsSummary?.nextStep || proactiveAction || 'Välj en liten vana att upprepa varje dag.',
    coachFeedback,
    coachActions,
    coachTimeline,
    goalsHabits: goalsHabitsSummary,
    movement:
      sharedReport.summaries.activity ||
      (Number.isFinite(steps)
        ? `${formatSteps(steps)} i senaste check-in.`
        : 'Stegdata saknas i senaste check-in.'),
    nextSteps: [
      hasProtein ? 'Behåll protein i nästa måltid.' : 'Lägg till protein i en måltid per dag.',
      hasVegetables ? 'Fortsätt med grönsaker/frukt.' : 'Lägg till frukt eller grönsaker dagligen.',
      energy <= 4 ? 'Planera återhämtning före hårdare träning.' : 'Ta en kort promenad på en fast tid.',
    ],
    nutritionStatus: hasProtein && hasVegetables
      ? 'Protein och grönsaker syns i matdata.'
      : hasProtein
        ? 'Protein syns, men grönsaker/frukt kan stärkas.'
        : 'Protein och grönsaker kan göras tydligare.',
    recovery:
      energy <= 4
        ? 'Återhämtning bör prioriteras kommande vecka.'
        : 'Energin verkar ge utrymme för en stabil vardagsrutin.',
    ...aiFallback,
    source: 'mock',
    summary:
      !goalsHabitsSummary
        ? `${sharedReport.summaries.coverage} ${sharedReport.summaries.weight}`
        : `Veckan visar mål och vanor: ${goalsHabitsSummary.summary}`,
    weightTrend: sharedReport.weightSummary.changeLabel === 'Saknas'
      ? sharedReport.summaries.weight
      : `Vikten är ${sharedReport.weightSummary.changeLabel} sedan start.`,
    mealPattern: sharedReport.summaries.nutrition || getMealPattern(mealHistory, snapshot.nutrition.mealsToday),
    sharedAnalytics: {
      ...sharedReport,
      coachFeedback,
    },
  }
}

/**
 * Requests an AI weekly report with local fallback.
 *
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createWeeklyReport(data) {
  const fallback = makeWeeklyReportFallback(data)

  const response = await requestAiEndpoint({
    ...data,
    action: 'weekly-report',
    aiConversationMemory: getRecentAiConversation(),
    userContext: buildAiUserContext(data),
  })
  const result = response.data || {}

  if (!response.ok || !result.report) {
    return fallback
  }

  return {
    ...fallback,
    ...result.report,
    source: result.source === 'openai' ? 'openai' : 'mock',
  }
}
