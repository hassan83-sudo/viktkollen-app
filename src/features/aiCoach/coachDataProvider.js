import { normalizeWeightEntries, parseWeightValue } from '../../services/healthCalculations.js'
import { normalizeProfile } from '../../services/profileService.js'
import { getLatestBodyScanEstimatedWeight } from '../../services/weightProvenance.js'
import { projectCoachContext } from './coachContext.js'

const POINT_LIMIT = 8
const LIST_LIMIT = 5

function roundKg(value) {
  return Number(value.toFixed(1))
}

function labelBodyScan(estimate) {
  if (!estimate) return null
  return {
    maxKg: estimate.maxKg,
    minKg: estimate.minKg,
    source: 'ai_estimated',
  }
}

function buildWeightTrend(source) {
  const measured = normalizeWeightEntries(source.weights).slice(-POINT_LIMIT)
  const latest = measured.at(-1) || null
  const previous = measured.at(-2) || null
  const bodyScanEstimate = labelBodyScan(getLatestBodyScanEstimatedWeight(source.bodyAnalysisHistory))
  if (!latest) {
    return {
      bodyScanEstimate,
      pointCount: 0,
      source: 'measured_or_user_entered',
      status: 'missing',
    }
  }
  if (!previous) {
    return {
      bodyScanEstimate,
      latestDate: String(latest.date).slice(0, 10),
      latestKg: latest.value,
      pointCount: 1,
      source: latest.source || 'user_entered',
      status: 'single',
    }
  }
  const changeKg = roundKg(latest.value - previous.value)
  return {
    bodyScanEstimate,
    changeKg,
    direction: changeKg < -0.1 ? 'ned' : changeKg > 0.1 ? 'upp' : 'stabil',
    latestDate: String(latest.date).slice(0, 10),
    latestKg: latest.value,
    pointCount: measured.length,
    points: measured.map((entry) => ({ date: String(entry.date).slice(0, 10), kg: entry.value })),
    previousKg: previous.value,
    source: 'measured_or_user_entered',
    status: 'trend',
  }
}

function buildGoal(profile, weightTrend) {
  const goalKg = parseWeightValue(profile.goalWeight)
  const direction = profile.weightDirection && profile.weightDirection !== 'missing' ? profile.weightDirection : null
  if (goalKg === null && !direction) return null
  const latestKg = weightTrend.status === 'missing' ? null : weightTrend.latestKg
  return {
    direction,
    goalKg,
    latestMeasuredKg: latestKg,
    remainingKg: goalKg !== null && latestKg != null ? roundKg(latestKg - goalKg) : null,
    source: profile.provenance?.goalWeight || 'user_entered',
  }
}

function sameDay(meal, today) {
  return String(meal?.date || meal?.createdAt || '').slice(0, 10) === today
}

function buildMealsAndProtein(source, today) {
  const meals = (Array.isArray(source.meals) ? source.meals : []).filter((meal) => sameDay(meal, today))
  if (!meals.length) return { meals: null, protein: null }
  const names = meals.map((meal) => String(meal.name || meal.title || '').trim()).filter(Boolean).slice(0, LIST_LIMIT)
  const proteinMeals = meals.filter((meal) => Number.isFinite(Number(meal.protein)))
  const grams = proteinMeals.length
    ? Math.round(proteinMeals.reduce((sum, meal) => sum + Number(meal.protein), 0))
    : null
  const target = Number(source.nutritionGoals?.protein?.target ?? source.nutritionGoals?.protein)
  return {
    meals: { count: meals.length, names, source: 'logged_meals' },
    protein: {
      grams,
      mealCount: meals.length,
      source: 'logged_meals',
      status: grams === null ? 'missing' : 'logged',
      targetGrams: Number.isFinite(target) && target > 0 ? target : null,
    },
  }
}

function buildActivity(source) {
  const checkIn = source.checkIn && typeof source.checkIn === 'object' ? source.checkIn : null
  if (!checkIn) return null
  const steps = Number(checkIn.steps)
  const workout = typeof checkIn.workout === 'string' ? checkIn.workout.trim() : ''
  if (!Number.isFinite(steps) && !workout) return null
  return {
    source: 'check-in',
    steps: Number.isFinite(steps) ? steps : null,
    workout: workout || null,
  }
}

function buildHabits(source) {
  const items = Array.isArray(source.foods) ? source.foods : []
  if (!items.length) return null
  return {
    done: items.filter((item) => item?.done).length,
    labels: items.map((item) => String(item?.label || item?.title || '').trim()).filter(Boolean).slice(0, 8),
    source: 'habit_checklist',
    total: items.length,
  }
}

function buildPreferences(profile) {
  if (profile.provenance?.dietaryPreferences === 'missing') return null
  const diet = profile.dietaryPreferences || {}
  const avoidedFoods = Array.isArray(diet.avoidedFoods) ? diet.avoidedFoods.slice(0, LIST_LIMIT) : []
  const preferredFoods = Array.isArray(diet.preferredFoods) ? diet.preferredFoods.slice(0, LIST_LIMIT) : []
  if (!avoidedFoods.length && !preferredFoods.length && (!diet.dietType || diet.dietType === 'omnivore')) return null
  return {
    avoidedFoods,
    dietType: diet.dietType || null,
    preferredFoods,
    source: 'user_entered',
  }
}

export function buildCoachPersonalContext(source = {}, { today = '2026-09-30' } = {}) {
  const profile = normalizeProfile(source.profile || {})
  const weightTrend = buildWeightTrend(source)
  const nutrition = buildMealsAndProtein(source, today)
  return projectCoachContext({
    activity: buildActivity(source),
    goal: buildGoal(profile, weightTrend),
    habits: buildHabits(source),
    meals: nutrition.meals,
    preferences: buildPreferences(profile),
    protein: nutrition.protein,
    weightTrend,
  })
}

export function createViktkollenCoachContext(source, options) {
  const data = buildCoachPersonalContext(source, options)
  return () => data
}
