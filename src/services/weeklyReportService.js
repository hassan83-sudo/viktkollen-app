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
import { buildAdaptiveCoachPatternSummary } from './adaptiveCoachPatterns.js'
import { buildAdaptiveCoachStrategy } from './adaptiveCoachStrategy.js'
import { buildPhotoAnalysisUsageSummary } from './nutritionPhotoAnalysis.js'
import { buildInsightsEngine } from './insights/insightsEngine.js'
import { buildAchievementSummary } from './achievements/achievementEngine.js'
import { buildSocialSummary } from './social/socialEngine.js'
import { buildPredictionReportSummary } from './prediction/healthPredictionEngine.js'
import { buildHealthJourneyReportSummary } from './healthJourney/healthJourneySummary.js'
import { buildSmartHabitGoalReportSummary } from './smartHabitGoalEngine.js'

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

function buildWeeklyReportV2(sharedReport, snapshot) {
  const activitySummary = sharedReport.activitySummary || {}
  const nutritionSummary = sharedReport.nutritionSummary || {}
  const comparisons = sharedReport.comparisons || {}
  const coverage = sharedReport.coverage || { level: 'missing', text: 'Underlag saknas.' }
  const quality =
    coverage.level === 'good'
      ? 'bra'
      : coverage.level === 'partial'
        ? 'medel'
        : 'begränsat'
  const strengths = (sharedReport.highlights || [])
    .filter((item) => item.tone === 'positive' || item.tone === 'neutral')
    .map((item) => item.text)
    .slice(0, 3)
  const focus = [
    ...(sharedReport.attentionItems || []).map((item) => item.action || item.text),
    ...(sharedReport.nextActions || []).map((item) => item.text),
  ]
    .filter(Boolean)
    .slice(0, 3)

  return {
    activity: {
      checkInDays: activitySummary.checkInCount ?? null,
      stepsAverage: activitySummary.averageSteps ?? null,
      summary: sharedReport.summaries.activity,
      trainingDays: activitySummary.trainingDays ?? null,
    },
    bodyScan: snapshot.weight.provenance?.latestBodyScanEstimate
      ? {
        estimatedWeight: snapshot.weight.provenance.latestBodyScanEstimate,
        provenance: 'ai_estimated',
      }
      : null,
    checkIn: {
      energy: activitySummary.averageEnergy ?? null,
      mood: activitySummary.averageMood ?? null,
      provenance: (activitySummary.checkInCount || 0) > 0 ? 'user_entered' : 'missing',
    },
    focus: focus.length ? focus : ['Samla mer data innan rapporten väljer ett skarpt fokus.'],
    nutrition: {
      averageCalories: nutritionSummary.averageCalories ?? null,
      averageProtein: nutritionSummary.averageProtein ?? null,
      loggedDays: nutritionSummary.loggedDays ?? null,
      provenance: nutritionSummary.provenance || null,
      provenanceSummary: nutritionSummary.provenanceText || '',
      summary: sharedReport.summaries.nutrition,
    },
    previousWeekComparison: {
      available: comparisons.hasComparison || false,
      confidence: comparisons.confidence || 'low',
      summary: comparisons.text || 'Jämförelse saknas.',
    },
    quality,
    reportQuality: {
      level: quality,
      summary: coverage.text,
    },
    strengths: strengths.length ? strengths : ['Inga datastyrda styrkor visas förrän veckan har fler registreringar.'],
    summary: 'Veckan i korthet bygger bara på sparad Viktkollen-data och tydligt separerade AI-estimat.',
    weight: {
      change: sharedReport.weightSummary.periodChange,
      current: sharedReport.weightSummary.currentWeight,
      goalRemaining: sharedReport.weightSummary.goalRemaining,
      provenance: sharedReport.weightSummary.currentWeight === null ? 'missing' : 'measured',
      summary: sharedReport.summaries.weight,
      trend: sharedReport.weightSummary.trend,
    },
  }
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
  const reportV2 = buildWeeklyReportV2(sharedReport, snapshot)
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
  const coachPatterns = buildAdaptiveCoachPatternSummary(data, {
    analysisDate: data.today,
    days: 7,
    now: data.today ? `${data.today}T12:00:00.000Z` : undefined,
  })
  const coachStrategy = buildAdaptiveCoachStrategy({
    ...data,
    patternSummary: coachPatterns,
  }, {
    analysisDate: data.today,
    period: '7d',
    now: data.today ? `${data.today}T12:00:00.000Z` : undefined,
  })
  const photoAnalysis = buildPhotoAnalysisUsageSummary(snapshot.nutrition.actualMeals || data.meals, sharedReport.period)
  const insights = buildInsightsEngine({
    ...data,
    healthSnapshot: snapshot,
  }, { analysisDate: data.today, period: '7d' })
  const achievements = buildAchievementSummary({
    ...data,
    healthSnapshot: snapshot,
  }, { analysisDate: data.today })
  const social = buildSocialSummary({
    ...data,
    healthSnapshot: snapshot,
  }, { analysisDate: data.today })
  const predictions = buildPredictionReportSummary({
    ...data,
    healthSnapshot: snapshot,
  }, { analysisDate: data.today, period: '7d' })
  const journey = buildHealthJourneyReportSummary({
    ...data,
    healthSnapshot: snapshot,
  }, { analysisDate: data.today, period: '7d' })
  const smartGoals = buildSmartHabitGoalReportSummary({
    ...data,
    healthSnapshot: snapshot,
  }, { analysisDate: data.today })

  return {
    biggestProgress:
      reportV2.strengths[0] ||
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
      reportV2.focus[0] || sharedReport.attentionItems[0]?.action || goalsHabitsSummary?.nextStep || proactiveAction || 'Välj en liten vana att upprepa varje dag.',
    coachFeedback,
    coachActions,
    coachTimeline,
    coachPatterns,
    coachStrategy,
    coachWeeklyPlan: {
      confidence: coachStrategy.confidence,
      coverage: coachStrategy.coverage,
      nextStep: coachStrategy.recommendations[0]?.action || 'Samla mer underlag innan veckoplanen blir personlig.',
      status: 'Utkast skapas i Adaptive Coach efter bekräftelse.',
    },
    photoAnalysis,
    insights,
    achievements,
    social,
    predictions,
    journey,
    smartGoals,
    goalsHabits: goalsHabitsSummary,
    movement:
      sharedReport.summaries.activity ||
      (Number.isFinite(steps)
        ? `${formatSteps(steps)} i senaste check-in.`
        : 'Stegdata saknas i senaste check-in.'),
    nextSteps: [
      ...reportV2.focus,
      hasProtein ? 'Behåll protein i nästa måltid.' : 'Lägg till protein i en måltid per dag.',
      hasVegetables ? 'Fortsätt med grönsaker/frukt.' : 'Lägg till frukt eller grönsaker dagligen.',
      energy <= 4 ? 'Planera återhämtning före hårdare träning.' : 'Ta en kort promenad på en fast tid.',
    ].slice(0, 3),
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
      insights,
      achievements,
      journey,
      predictions,
      smartGoals,
      social,
    },
    weeklyReportV2: reportV2,
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
