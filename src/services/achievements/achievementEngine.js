import { normalizeCheckInMetrics } from '../checkInNormalization.js'
import { getEntryLocalDate, getLocalDateString } from '../localDate.js'
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
  const workouts = normalizedCheckIns.filter((entry) => entry.metrics.workout?.completed)
  const weights = safeArray(data.weights)
  const goals = safeArray(data.goalsHabits?.goals)
  const habits = safeArray(data.goalsHabits?.habits)
  const weeklyFocus = safeArray(data.goalsHabits?.weeklyFocus)
  const registeredDates = [
    ...mealDates,
    ...normalizedCheckIns.map((entry) => entry.date),
    ...weights.map((weight) => getEntryLocalDate(weight) || getLocalDateString(weight.date || weight.createdAt || today)),
  ]

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
    portabilityEvents: safeArray(data.goalsHabits?.achievements?.events)
      .filter((event) => ['exportCompleted', 'importCompleted', 'backupCompleted', 'restoreCompleted'].includes(event.type)).length,
    registeredDays: uniqueCount(registeredDates),
    stepDays: uniqueCount(stepDays.map((entry) => entry.date)),
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
    'first-portability-event': counts.portabilityEvents,
    'first-workout': counts.workouts,
    'habit-three-days': counts.habitStreak,
    'seven-actual-meals': counts.actualMeals,
    'seven-registered-days': counts.registeredDays,
    'three-registered-days': counts.registeredDays,
    'three-step-days': counts.stepDays,
    'weekly-focus-completed': counts.completedWeeklyFocus,
  }

  return Math.max(0, Number(map[definition.id]) || 0)
}

function buildAchievement(definition, counts, ledger) {
  const progress = progressForDefinition(definition, counts)
  const unlockedByLedger = ledger.unlocked.includes(definition.id)
  const unlocked = progress >= definition.target || unlockedByLedger

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
    summary: {
      activeChallengeCount: challenges.filter((challenge) => challenge.status !== 'completed').length,
      latestAchievementTitle: unlocked.at(-1)?.title || 'Inga achievements upplåsta ännu',
      milestoneCount: milestones.reachedCount,
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
    totalXp: model.summary.totalXp,
    unlockedCount: model.summary.unlockedCount,
  }
}

export const achievementEngineInternals = {
  countCoachStatuses,
  getEvidenceCounts,
  progressForDefinition,
}
