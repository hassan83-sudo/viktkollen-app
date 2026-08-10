import { normalizeCheckInMetrics } from '../checkInNormalization.js'
import { getEntryLocalDate, getLocalDateString } from '../localDate.js'
import { summarizeDay } from '../nutritionService.js'
import { getSafeAchievementDefinitions } from './achievementDefinitions.js'
import { normalizeAchievementState } from './achievementLedger.js'
import { buildAchievementChallenges } from './challengeEngine.js'
import { buildMilestones } from './milestoneEngine.js'
import { calculateAchievementXp } from './xpEngine.js'

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function isActualMeal(meal = {}) {
  return meal?.planned !== true && meal?.status !== 'planned' && meal?.source !== 'weekly-plan'
}

function getMealDate(meal = {}) {
  return getEntryLocalDate(meal) || ''
}

function uniqueCount(values = []) {
  return new Set(values.filter(Boolean)).size
}

function uniqueDates(values = []) {
  return [...new Set(values.filter(Boolean))].sort((first, second) => first.localeCompare(second, 'sv-SE'))
}

function countCoachStatuses(feedback = {}, statuses = []) {
  const wanted = new Set(statuses)
  const values = [
    ...safeArray(feedback.recommendations),
    ...safeArray(feedback.actions),
    ...safeArray(feedback.history),
    ...safeArray(feedback.timeline),
  ]

  return values.filter((entry) => wanted.has(entry.status || entry.action || entry.type)).length
}

function getCompletedHabitDays(goalsHabits = {}) {
  return Math.max(
    0,
    ...safeArray(goalsHabits.habits).map((habit) => uniqueCount(habit.completedDates || habit.history?.map((entry) => entry.date))),
  )
}

function getWeightEntries(data = {}, today = '') {
  const weights = safeArray(data.healthSnapshot?.weight?.dailyWeights).length
    ? safeArray(data.healthSnapshot?.weight?.dailyWeights)
    : safeArray(data.weights)

  return weights
    .map((entry) => ({
      date: getEntryLocalDate(entry) || getLocalDateString(entry.date || entry.createdAt || today),
      value: Number(entry.value ?? entry.weight),
    }))
    .filter((entry) => entry.date && Number.isFinite(entry.value))
    .sort((first, second) => first.date.localeCompare(second.date, 'sv-SE'))
}

function getWeightProgress(data = {}, weightEntries = []) {
  const facts = data.healthSnapshot?.weight?.facts || {}
  const start = Number(facts.startWeight ?? data.profile?.startWeight ?? weightEntries[0]?.value)
  const current = Number(facts.currentWeight ?? weightEntries.at(-1)?.value)
  const goal = Number(facts.goalWeight ?? data.profile?.goalWeight)
  const totalChange = Number(facts.totalChangeKg ?? facts.totalChange ?? (current - start))
  const progressKg = Number.isFinite(totalChange) ? Math.abs(totalChange) : 0
  const totalDistance = Number.isFinite(start) && Number.isFinite(goal) ? goal - start : null
  const completedDistance = Number.isFinite(start) && Number.isFinite(current) ? current - start : null
  const goalProgressPercent = Number.isFinite(totalDistance) &&
    Number.isFinite(completedDistance) &&
    totalDistance !== 0
    ? Math.max(0, Math.min(100, Math.abs(completedDistance) / Math.abs(totalDistance) * 100))
    : 0

  return {
    goalProgressPercent,
    progressKg,
    weightEntries,
  }
}

function calculateLongestStreak(dates = []) {
  const sorted = uniqueDates(dates)
  let longest = 0
  let current = 0
  let previous = null

  sorted.forEach((date) => {
    const currentTime = new Date(`${date}T12:00:00`).getTime()
    const previousTime = previous ? new Date(`${previous}T12:00:00`).getTime() : null
    const dayAfterPrevious = previousTime !== null && currentTime - previousTime === 24 * 60 * 60 * 1000

    current = dayAfterPrevious ? current + 1 : 1
    longest = Math.max(longest, current)
    previous = date
  })

  return longest
}

function getProteinGoalDates(meals = [], nutritionGoals = {}) {
  const mealDates = uniqueDates(meals.map(getMealDate))

  return mealDates.filter((date) => {
    const summary = summarizeDay(meals, date, nutritionGoals)
    const proteinGoal = Number(summary.goals?.protein)

    return Number.isFinite(proteinGoal) &&
      proteinGoal > 0 &&
      Number(summary.totals?.protein || 0) >= proteinGoal
  })
}

function getCumulativeDate(entries = [], target, valueKey = 'value') {
  let total = 0

  return entries.find((entry) => {
    total += Math.max(0, Number(entry[valueKey]) || 0)
    return total >= target
  })?.date || ''
}

function getNthDate(dates = [], target) {
  return uniqueDates(dates)[target - 1] || ''
}

function getNthEventDate(dates = [], target) {
  return dates.filter(Boolean).sort((first, second) => first.localeCompare(second, 'sv-SE'))[target - 1] || ''
}

function getLedgerUnlockedDate(ledger, definitionId) {
  return ledger.events.find((event) =>
    event.definitionId === definitionId &&
    ['achievementUnlocked', 'milestoneReached'].includes(event.type) &&
    event.at)?.at || ''
}

function getEvidenceCounts(data = {}, options = {}) {
  const today = getLocalDateString(options.analysisDate || data.today || new Date())
  const meals = safeArray(data.meals).filter(isActualMeal)
  const mealDates = meals.map(getMealDate)
  const checkIns = [
    ...safeArray(data.checkIns),
    data.checkIn,
  ].filter(Boolean)
  const normalizedCheckIns = checkIns.map((entry) => ({
    date: getEntryLocalDate(entry) || getLocalDateString(entry.date || entry.createdAt || today),
    metrics: normalizeCheckInMetrics(entry),
  }))
  const stepDays = normalizedCheckIns.filter((entry) => Number.isFinite(entry.metrics.steps) && entry.metrics.steps > 0)
  const stepEntries = stepDays
    .map((entry) => ({ date: entry.date, value: entry.metrics.steps }))
    .sort((first, second) => first.date.localeCompare(second.date, 'sv-SE'))
  const workouts = normalizedCheckIns.filter((entry) => entry.metrics.workout?.completed)
  const weights = getWeightEntries(data, today)
  const weightProgress = getWeightProgress(data, weights)
  const goals = safeArray(data.goalsHabits?.goals)
  const habits = safeArray(data.goalsHabits?.habits)
  const weeklyFocus = safeArray(data.goalsHabits?.weeklyFocus)
  const registeredDates = [
    ...mealDates,
    ...normalizedCheckIns.map((entry) => entry.date),
    ...weights.map((weight) => weight.date),
  ]
  const proteinGoalDates = getProteinGoalDates(meals, data.nutritionGoals)

  return {
    actualMeals: meals.length,
    checkIns: normalizedCheckIns.length,
    coachAccepted: countCoachStatuses(data.adaptiveCoachFeedback, ['accepted']),
    coachCompleted: countCoachStatuses(data.adaptiveCoachFeedback, ['completed']),
    completedGoals: goals.filter((goal) => goal.status === 'completed').length,
    completedWeeklyFocus: weeklyFocus.filter((focus) => focus.status === 'completed').length,
    goals: goals.length,
    habits: habits.length,
    habitStreak: getCompletedHabitDays(data.goalsHabits),
    latestDates: {
      actualMeals: getNthEventDate(mealDates, meals.length),
      firstMeal: getNthDate(mealDates, 1),
      firstWeighIn: weights[0]?.date || '',
      registered: getNthDate(registeredDates, uniqueCount(registeredDates)),
      steps10000: stepEntries.find((entry) => entry.value >= 10000)?.date || '',
      stepTotal50000: getCumulativeDate(stepEntries, 50000),
      stepTotal100000: getCumulativeDate(stepEntries, 100000),
      stepTotal250000: getCumulativeDate(stepEntries, 250000),
    },
    longestRegisteredStreak: calculateLongestStreak(registeredDates),
    maxSteps: Math.max(0, ...stepEntries.map((entry) => entry.value)),
    portabilityEvents: safeArray(data.goalsHabits?.achievements?.events)
      .filter((event) => ['exportCompleted', 'importCompleted', 'backupCompleted', 'restoreCompleted'].includes(event.type)).length,
    proteinGoalDates,
    proteinGoalDays: proteinGoalDates.length,
    registeredDays: uniqueCount(registeredDates),
    stepDays: uniqueCount(stepDays.map((entry) => entry.date)),
    totalSteps: stepEntries.reduce((sum, entry) => sum + entry.value, 0),
    weightGoalProgressPercent: weightProgress.goalProgressPercent,
    weightProgressKg: weightProgress.progressKg,
    weights: weights.length,
    workouts: workouts.length,
  }
}

function progressForDefinition(definition, counts) {
  const map = {
    'coach-action-accepted': counts.coachAccepted,
    'coach-action-completed': counts.coachCompleted,
    'first-check-in': counts.checkIns,
    'first-goal-completed': counts.completedGoals,
    'first-goal-created': counts.goals,
    'first-habit-created': counts.habits,
    'first-meal': counts.actualMeals,
    'first-weigh-in': counts.weights,
    'first-portability-event': counts.portabilityEvents,
    'first-workout': counts.workouts,
    'fifty-actual-meals': counts.actualMeals,
    'goal-weight-reached': counts.weightGoalProgressPercent,
    'halfway-goal-weight': counts.weightGoalProgressPercent,
    'habit-three-days': counts.habitStreak,
    'protein-goal-first': counts.proteinGoalDays,
    'protein-goal-5-days': counts.proteinGoalDays,
    'protein-goal-10-days': counts.proteinGoalDays,
    'protein-goal-25-days': counts.proteinGoalDays,
    'seven-actual-meals': counts.actualMeals,
    'seven-registered-days': counts.registeredDays,
    'steps-10000-day': counts.maxSteps,
    'steps-50000-total': counts.totalSteps,
    'steps-100000-total': counts.totalSteps,
    'steps-250000-total': counts.totalSteps,
    'ten-actual-meals': counts.actualMeals,
    'consistency-3-day-streak': counts.longestRegisteredStreak,
    'consistency-7-day-streak': counts.longestRegisteredStreak,
    'consistency-14-day-streak': counts.longestRegisteredStreak,
    'consistency-30-day-streak': counts.longestRegisteredStreak,
    'three-registered-days': counts.registeredDays,
    'three-step-days': counts.stepDays,
    'weekly-focus-completed': counts.completedWeeklyFocus,
    'weight-progress-1kg': counts.weightProgressKg,
    'weight-progress-3kg': counts.weightProgressKg,
    'weight-progress-5kg': counts.weightProgressKg,
  }

  return Math.max(0, Number(map[definition.id]) || 0)
}

function getDerivedUnlockedDate(definition, counts) {
  const target = Number(definition.target) || 0
  const dateMap = {
    'first-meal': counts.latestDates.firstMeal,
    'first-weigh-in': counts.latestDates.firstWeighIn,
    'protein-goal-first': getNthDate(counts.proteinGoalDates, target),
    'steps-10000-day': counts.latestDates.steps10000,
    'steps-50000-total': counts.latestDates.stepTotal50000,
    'steps-100000-total': counts.latestDates.stepTotal100000,
    'steps-250000-total': counts.latestDates.stepTotal250000,
  }

  if (definition.id.startsWith('protein-goal-')) {
    return getNthDate(counts.proteinGoalDates, target)
  }

  if (definition.id.endsWith('actual-meals')) {
    return counts.actualMeals >= target ? counts.latestDates.actualMeals : ''
  }

  return dateMap[definition.id] || ''
}

function buildAchievement(definition, counts, ledger) {
  const rawProgress = progressForDefinition(definition, counts)
  const unlockedByLedger = ledger.unlocked.includes(definition.id)
  const unlocked = rawProgress >= definition.target || unlockedByLedger
  const progress = unlockedByLedger ? Math.max(rawProgress, definition.target) : rawProgress
  const unlockedAt = unlocked
    ? getLedgerUnlockedDate(ledger, definition.id) || getDerivedUnlockedDate(definition, counts)
    : ''

  return {
    acknowledged: ledger.acknowledged.includes(definition.id),
    category: definition.category,
    definitionId: definition.id,
    description: definition.description,
    evidence: {
      count: progress,
      source: definition.source,
      target: definition.target,
    },
    id: `achievement-${definition.id}`,
    progress,
    progressPercent: definition.target ? Math.min(100, Math.round((progress / definition.target) * 100)) : 0,
    source: definition.source,
    status: unlocked ? 'unlocked' : progress > 0 ? 'inProgress' : 'locked',
    target: definition.target,
    title: definition.title,
    unit: definition.unit,
    unlockedAt,
    xp: definition.xp,
  }
}

function buildCoverage(counts) {
  const sources = [
    counts.actualMeals > 0,
    counts.checkIns > 0,
    counts.goals > 0 || counts.habits > 0,
    counts.registeredDays > 0,
    counts.coachAccepted + counts.coachCompleted > 0,
  ]
  return Math.round((sources.filter(Boolean).length / sources.length) * 100)
}

export function buildAchievementEngine(data = {}, options = {}) {
  const { blocked, safe } = getSafeAchievementDefinitions()
  const ledger = normalizeAchievementState(data.goalsHabits?.achievements)
  const counts = getEvidenceCounts(data, options)
  const achievements = safe.map((definition) => buildAchievement(definition, counts, ledger))
  const unlocked = achievements.filter((achievement) => achievement.status === 'unlocked')
  const nextAchievement = achievements
    .filter((achievement) => achievement.status !== 'unlocked')
    .sort((first, second) =>
      second.progressPercent - first.progressPercent ||
      first.target - second.target ||
      first.title.localeCompare(second.title, 'sv-SE'),
    )[0] || null
  const latestUnlocked = [...unlocked].sort((first, second) =>
    String(second.unlockedAt || '').localeCompare(String(first.unlockedAt || ''), 'sv-SE'),
  )[0] || unlocked.at(-1) || null
  const milestones = buildMilestones(data)
  const challenges = buildAchievementChallenges(data, options)
  const xp = calculateAchievementXp(achievements, ledger)
  const coverage = buildCoverage(counts)
  const confidence = Math.max(20, Math.min(100, Math.round((coverage + Math.min(100, counts.registeredDays * 8)) / 2)))

  return {
    achievements,
    blockedDefinitions: blocked,
    challenges,
    confidence,
    counts,
    coverage,
    level: {
      currentXp: xp.currentXp,
      level: xp.level,
      nextLevelXp: xp.nextLevelXp,
      progressPercent: xp.progressPercent,
      title: xp.title,
    },
    ledger,
    milestones,
    newEvents: [
      ...unlocked
        .filter((achievement) => !ledger.unlocked.includes(achievement.definitionId))
        .map((achievement) => ({
          achievementId: achievement.id,
          definitionId: achievement.definitionId,
          eventId: `achievement-${achievement.definitionId}`,
          source: achievement.source,
          type: 'achievementUnlocked',
        })),
      ...xp.events,
    ],
    nextAchievement,
    summary: {
      activeChallengeCount: challenges.filter((challenge) => challenge.status !== 'completed').length,
      latestAchievementTitle: latestUnlocked?.title || 'Inga achievements upplåsta ännu',
      milestoneCount: milestones.reachedCount,
      nextAchievementTitle: nextAchievement?.title || 'Alla achievements upplåsta',
      totalXp: xp.totalXp,
      unlockedCount: unlocked.length,
    },
  }
}

export function buildAchievementSummary(data = {}, options = {}) {
  const model = buildAchievementEngine(data, options)

  return {
    activeChallengeCount: model.summary.activeChallengeCount,
    confidence: model.confidence,
    coverage: model.coverage,
    latestAchievementTitle: model.summary.latestAchievementTitle,
    level: model.level.level,
    levelTitle: model.level.title,
    milestoneCount: model.summary.milestoneCount,
    nextAchievement: model.nextAchievement,
    nextAchievementTitle: model.summary.nextAchievementTitle,
    totalXp: model.summary.totalXp,
    unlockedCount: model.summary.unlockedCount,
  }
}

export const achievementEngineInternals = {
  countCoachStatuses,
  getEvidenceCounts,
  progressForDefinition,
}
