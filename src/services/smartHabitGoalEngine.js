import { buildCoachPlanCenterModel } from './coachActionPlanEngine.js'
import { buildGoalsHabitsReportSummary, buildGoalsHabitsViewModel, normalizeGoalsHabitsState } from './goalsHabits.js'
import { buildHealthJourneyReportSummary } from './healthJourney/healthJourneySummary.js'
import { getLocalDateString } from './localDate.js'
import { buildNutritionCoachModel } from './nutrition/nutritionCoachEngine.js'
import { buildHealthPredictionModel } from './prediction/healthPredictionEngine.js'
import { buildSharedAnalytics } from './sharedAnalyticsEngine.js'

export const smartHabitGoalEngineVersion = 1

const recommendationLimit = 5

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeText(value, fallback = '', max = 220) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max)
}

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, number))
}

function pct(value) {
  if (!Number.isFinite(value)) return 'Saknas'
  return `${Math.round(value).toLocaleString('sv-SE')}%`
}

function hashText(value) {
  const text = safeText(value).toLocaleLowerCase('sv-SE')
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function adaptationFromCompletion(completionRate, predictionConfidence) {
  if (completionRate < 35) {
    return {
      difficulty: 'easier',
      durationMinutes: 5,
      text: 'Svårigheten sänks eftersom följsamheten är låg just nu.',
    }
  }
  if (completionRate >= 80 && predictionConfidence >= 55) {
    return {
      difficulty: 'slightly_harder',
      durationMinutes: 15,
      text: 'Svårigheten kan höjas försiktigt eftersom flera signaler är stabila.',
    }
  }
  return {
    difficulty: 'balanced',
    durationMinutes: 10,
    text: 'Svårigheten hålls realistisk och lätt att upprepa.',
  }
}

function makeRecommendation({ action, category, confidence, explanation, habit, priority = 50, title, type }) {
  const safeTitle = safeText(title, 'Rekommendation', 90)
  const safeCategory = safeText(category, 'custom', 40)

  return {
    action: safeText(action, 'Välj ett litet nästa steg.'),
    category: safeCategory,
    confidence: clamp(confidence, 10, 95),
    explanation: safeText(explanation, 'Vald från befintliga aggregerade appdata.', 320),
    habit: habit ? safeText(habit, '', 120) : '',
    id: `smart-goal-${safeCategory}-${hashText(`${type}|${safeCategory}|${safeTitle}|${action}`)}`,
    priority: clamp(priority, 1, 100),
    source: 'smartHabitGoalEngine',
    title: safeTitle,
    type: safeText(type, 'habit', 40),
  }
}

function buildRecommendedGoals({ adaptation, journey, nutritionCoach, predictions, shared, viewModel }) {
  const existingGoalCategories = new Set(viewModel.activeGoals.map(({ goal }) => goal.category))
  const predictionConfidence = predictions.confidence || 35
  const items = []

  if (!existingGoalCategories.has('protein') && nutritionCoach.gaps.some((gap) => gap.toLocaleLowerCase('sv-SE').includes('protein'))) {
    items.push(makeRecommendation({
      action: 'Sikta på protein i två vanliga måltider den här veckan.',
      category: 'protein',
      confidence: nutritionCoach.confidenceScore,
      explanation: 'Nutrition Coach visar att protein kan stärkas utan att göra planen extrem.',
      priority: 74,
      title: 'Veckomål för protein',
      type: 'weeklyGoal',
    }))
  }

  if (!existingGoalCategories.has('steps') && Number(shared.activitySummary.averageSteps) > 0) {
    const base = Math.round(clamp(shared.activitySummary.averageSteps * 1.05, 3000, 12000) / 500) * 500
    items.push(makeRecommendation({
      action: `Testa ett veckomål runt ${base.toLocaleString('sv-SE')} steg på aktiva dagar.`,
      category: 'steps',
      confidence: predictionConfidence,
      explanation: 'Stegmålet utgår från ditt aggregerade snitt och justeras försiktigt.',
      priority: 64,
      title: 'Realistiskt stegmål',
      type: 'weeklyGoal',
    }))
  }

  if (!viewModel.activeFocus.length) {
    items.push(makeRecommendation({
      action: journey.mainCurrentFocus || 'Välj ett litet veckofokus som går att upprepa.',
      category: 'weekly_focus',
      confidence: journey.confidence,
      explanation: 'Health Journey visar aktuellt fokus utan att använda rå historik.',
      priority: 68,
      title: 'Veckans fokus',
      type: 'weeklyGoal',
    }))
  }

  return items
    .map((item) => ({
      ...item,
      durationMinutes: adaptation.durationMinutes,
    }))
    .sort((first, second) => second.priority - first.priority)
    .slice(0, recommendationLimit)
}

function buildRecommendedHabits({ adaptation, nutritionCoach, predictions, shared, viewModel }) {
  const existingHabitCategories = new Set(viewModel.todayHabits.map(({ habit }) => habit.category))
  const items = []

  if (!existingHabitCategories.has('check_in')) {
    items.push(makeRecommendation({
      action: 'Gör en kort check-in en gång per dag.',
      category: 'check_in',
      confidence: shared.coverage.checkInDays ? 62 : 42,
      explanation: 'Check-ins förbättrar coachningens täckning och kräver lite tid.',
      habit: 'Kort daglig check-in',
      priority: 66,
      title: 'Daglig check-in',
      type: 'dailyHabit',
    }))
  }

  if (!existingHabitCategories.has('meal_logging') && nutritionCoach.dailyTimeline.mealCount === 0) {
    items.push(makeRecommendation({
      action: 'Logga nästa vanliga måltid, inte en perfekt måltid.',
      category: 'meal_logging',
      confidence: nutritionCoach.confidenceScore,
      explanation: 'Nutrition Coach behöver faktisk måltidsdata, men saknad data bedöms neutralt.',
      habit: 'Logga en måltid',
      priority: 72,
      title: 'Måltidsloggning',
      type: 'dailyHabit',
    }))
  }

  if (!existingHabitCategories.has('protein') && nutritionCoach.gaps.some((gap) => gap.includes('Protein'))) {
    items.push(makeRecommendation({
      action: 'Lägg till en enkel proteinkälla i nästa måltid.',
      category: 'protein',
      confidence: nutritionCoach.confidenceScore,
      explanation: 'Kopplas till Nutrition Coach och dagens nutrition gaps.',
      habit: 'Protein i nästa måltid',
      priority: 70,
      title: 'Protein-vana',
      type: 'dailyHabit',
    }))
  }

  if (!existingHabitCategories.has('steps') && predictions.warningSignals.some((warning) => warning.category === 'activity')) {
    items.push(makeRecommendation({
      action: 'Ta ett kort rörelseblock på 5 minuter.',
      category: 'steps',
      confidence: predictions.confidence,
      explanation: 'Prediction Engine visar en försiktig aktivitetssignal, så vanan hålls kort.',
      habit: 'Kort rörelseblock',
      priority: 65,
      title: 'Liten rörelsevana',
      type: 'dailyHabit',
    }))
  }

  return items
    .map((item) => ({
      ...item,
      durationMinutes: adaptation.durationMinutes,
    }))
    .sort((first, second) => second.priority - first.priority)
    .slice(0, recommendationLimit)
}

function buildGoalProbability({ predictions, reportSummary, viewModel }) {
  const completion = viewModel.completionRate
  const prediction = predictions.predictions.find((item) => ['adherence', 'consistency', 'actionPlan'].includes(item.metric))
  const activeGoalFactor = viewModel.activeGoals.length ? 10 : 0
  const probability = clamp((completion * 0.45) + ((prediction?.confidence || predictions.confidence || 35) * 0.35) + activeGoalFactor + 10, 10, 90)

  return {
    explanation: prediction
      ? prediction.explanation
      : reportSummary.summary || 'Sannolikheten blir tryggare när fler vanor och mål följs.',
    percent: Math.round(probability),
    predictionId: prediction?.id || '',
    text: `${pct(probability)} sannolikhet med nuvarande underlag.`,
  }
}

export function buildSmartHabitGoalModel(input = {}, options = {}) {
  const analysisDate = getLocalDateString(options.analysisDate || input.analysisDate || input.today || new Date())
  const goalsHabits = normalizeGoalsHabitsState(input.goalsHabits)
  const data = { ...input, analysisDate, goalsHabits }
  const shared = input.sharedAnalytics || buildSharedAnalytics(data, { analysisDate, period: '30d' })
  const viewModel = buildGoalsHabitsViewModel(goalsHabits, data, { analysisDate })
  const reportSummary = buildGoalsHabitsReportSummary(goalsHabits, data, { analysisDate })
  const predictions = input.predictions || buildHealthPredictionModel(data, { analysisDate })
  const nutritionCoach = input.nutritionCoach || buildNutritionCoachModel(data, { analysisDate })
  const coachPlan = input.coachPlan || buildCoachPlanCenterModel(data, { analysisDate })
  const journey = input.journey || buildHealthJourneyReportSummary(data, { analysisDate, period: '30d' })
  const adaptation = adaptationFromCompletion(viewModel.completionRate, predictions.confidence)
  const recommendedGoals = buildRecommendedGoals({ adaptation, journey, nutritionCoach, predictions, shared, viewModel })
  const recommendedHabits = buildRecommendedHabits({ adaptation, nutritionCoach, predictions, shared, viewModel })
  const probability = buildGoalProbability({ predictions, reportSummary, viewModel })
  const weeklyGoalStatus = viewModel.activeGoals.length
    ? `${viewModel.activeGoals.length} aktiva mål. ${reportSummary.positiveProgress}`
    : 'Inga aktiva veckomål ännu.'
  const nextStep = recommendedHabits[0]?.action || recommendedGoals[0]?.action || coachPlan.nextRecommendedAction || reportSummary.nextStep
  const coverage = Math.round(clamp((shared.coverage.ratio || 0) * 100, 0, 100))
  const confidence = Math.round(clamp((predictions.confidence + nutritionCoach.confidenceScore + journey.confidence) / 3, 10, 92))

  return {
    activeGoals: viewModel.activeGoals.map(({ goal, progress }) => ({
      id: goal.id,
      progress,
      title: goal.title,
      category: goal.category,
      status: goal.status,
    })),
    activeHabits: viewModel.todayHabits.map(({ habit, status, streak }) => ({
      id: habit.id,
      category: habit.category,
      status,
      streak,
      title: habit.title,
    })),
    adaptation,
    analysisDate,
    coachPlanLink: {
      available: Boolean(coachPlan.plan),
      explanation: coachPlan.adaptiveChanges || 'Coach action plans kan skapa nästa steg när användaren bekräftar.',
      nextAction: coachPlan.nextRecommendedAction || nextStep,
    },
    confidence,
    coverage,
    dashboard: {
      nextStep,
      todayHabit: recommendedHabits[0]?.title || viewModel.todayHabits[0]?.habit?.title || 'Välj en liten vana',
      weeklyGoalProbability: probability.text,
      weeklyGoalStatus,
    },
    limitations: [
      coverage < 25 ? 'Datatäckningen är låg, så rekommendationerna hålls enkla.' : '',
      'Förslag sparas inte förrän användaren väljer att skapa mål, vana eller veckofokus.',
      'AI får endast formulera om minimal sammanfattning efter samtycke.',
    ].filter(Boolean),
    milestones: [
      journey.milestone,
      reportSummary.longestStreak ? `Längsta streak: ${reportSummary.longestStreak}` : '',
      predictions.opportunities?.[0]?.title,
    ].filter(Boolean).slice(0, 4),
    prediction: probability,
    recommendedGoals,
    recommendedHabits,
    reportSummary,
    version: smartHabitGoalEngineVersion,
    weeklyProgress: {
      completionRate: viewModel.completionRate,
      label: `${viewModel.completionRate}% av dagens planerade vanor är klara.`,
      todayDone: viewModel.todaySummary.done,
      todayScheduled: viewModel.todaySummary.scheduled,
    },
  }
}

export function buildSmartHabitGoalReportSummary(input = {}, options = {}) {
  const model = buildSmartHabitGoalModel(input, options)

  return {
    confidence: model.confidence,
    limitations: model.limitations,
    nextStep: model.dashboard.nextStep,
    probability: model.prediction.text,
    recommendedHabit: model.recommendedHabits[0]?.title || 'Ingen ny vana rekommenderas just nu.',
    recommendedWeeklyGoal: model.recommendedGoals[0]?.title || 'Inget nytt veckomål rekommenderas just nu.',
    summary: `${model.dashboard.weeklyGoalStatus} ${model.weeklyProgress.label}`,
  }
}

export function buildMinimalSmartHabitGoalAiPayload(model = {}, { consent = false } = {}) {
  if (!consent) {
    return {
      allowed: false,
      reason: 'Samtycke krävs.',
    }
  }

  return {
    allowed: true,
    confidence: model.confidence,
    habit: model.recommendedHabits?.[0]
      ? {
        category: model.recommendedHabits[0].category,
        title: model.recommendedHabits[0].title,
      }
      : null,
    limitations: safeArray(model.limitations).slice(0, 3),
    summary: model.dashboard?.nextStep || model.reportSummary?.summary || '',
    targetCategory: model.recommendedGoals?.[0]?.category || model.activeGoals?.[0]?.category || 'custom',
  }
}
