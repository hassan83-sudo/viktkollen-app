import { getEffectiveMealNutrition } from './mealCorrections.js'

export const nutritionGoalFields = {
  calories: {
    aliases: ['calories', 'calorieGoal', 'caloriesGoal', 'calorieGoalKcal', 'calorieGoalKcal'],
    label: 'Kalorimål',
    max: 10000,
    min: 0,
    requiredPositive: true,
    unit: 'kcal',
  },
  protein: {
    aliases: ['protein', 'proteinGoal', 'proteinGoalGrams'],
    label: 'Proteinmål',
    max: 500,
    min: 0,
    requiredPositive: true,
    unit: 'g',
  },
  carbs: {
    aliases: ['carbs', 'carbohydrates', 'carbsGoal', 'carbsGoalGrams'],
    label: 'Kolhydratmål',
    max: 1000,
    min: 0,
    requiredPositive: false,
    unit: 'g',
  },
  fat: {
    aliases: ['fat', 'fatGoal', 'fatGoalGrams'],
    label: 'Fettmål',
    max: 500,
    min: 0,
    requiredPositive: false,
    unit: 'g',
  },
  fiber: {
    aliases: ['fiber', 'fiberGoal', 'fiberGoalGrams'],
    label: 'Fibermål',
    max: 200,
    min: 0,
    requiredPositive: false,
    unit: 'g',
  },
}

const sourceValues = new Set(['manual', 'suggested'])

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseDate(value) {
  if (!value) return null

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

function parseGoalNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null
  }

  const text = String(value).trim().replace(',', '.')

  if (!/^-?\d+(?:\.\d+)?$/.test(text)) {
    return null
  }

  const parsed = Number(text)

  return Number.isFinite(parsed) ? parsed : null
}

function parseFirstGoalNumber(value) {
  const match = String(value ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/)
  const parsed = match ? Number(match[0]) : NaN

  return Number.isFinite(parsed) ? parsed : null
}

function getFirstValue(goals, field) {
  for (const alias of nutritionGoalFields[field].aliases) {
    if (goals?.[alias] !== undefined && goals?.[alias] !== null && String(goals[alias]).trim() !== '') {
      return goals[alias]
    }
  }

  return ''
}

function normalizeSource(value, fallback = 'manual') {
  const source = String(value || '').trim()

  return sourceValues.has(source) ? source : fallback
}

function roundTo(value, step = 5) {
  return Math.round(value / step) * step
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function parseActivityLevel(value) {
  const text = String(value || '').toLocaleLowerCase('sv-SE')

  if (/mycket|hög|hog|aktiv|gym|träna|trana|sport|5/.test(text)) return 'high'
  if (/låg|lag|stillasittande|lite|1/.test(text)) return 'low'
  if (/medel|normal|måttlig|mattlig|promenad|3/.test(text)) return 'moderate'

  return 'moderate'
}

function parseGoalDirection(profile = {}, weightData = {}) {
  const text = [
    profile.goal,
    profile.weightGoal,
    profile.goalDirection,
    profile.target,
    weightData.goal,
  ].join(' ').toLocaleLowerCase('sv-SE')
  const currentWeight = getLatestValidWeight(weightData, profile)
  const goalWeight = parseGoalNumber(profile.goalWeight ?? weightData.goalWeight)

  if (/gå ner|ga ner|ned|minsk|loss|deff/.test(text)) return 'loss'
  if (/gå upp|ga upp|bygg|gain|muskel/.test(text)) return 'gain'
  if (/håll|hall|behåll|behall|maintain|stabil/.test(text)) return 'maintain'

  if (Number.isFinite(currentWeight) && Number.isFinite(goalWeight)) {
    if (goalWeight < currentWeight - 1) return 'loss'
    if (goalWeight > currentWeight + 1) return 'gain'
  }

  return 'maintain'
}

function getEntryTime(entry) {
  const date = parseDate(entry?.date || entry?.createdAt || entry?.timestamp)

  return date?.getTime() || 0
}

export function getLatestValidWeight(weightData = {}, profile = {}, today = new Date()) {
  const todayText = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
  const entries = Array.isArray(weightData)
    ? weightData
    : Array.isArray(weightData.weights)
      ? weightData.weights
      : Array.isArray(weightData.history)
        ? weightData.history
        : []
  const weights = entries
    .map((entry) => {
      const value = parseGoalNumber(entry?.weight ?? entry?.value)
      const date = String(entry?.date || entry?.createdAt || '').slice(0, 10)

      return {
        time: getEntryTime(entry),
        value,
        date,
      }
    })
    .filter((entry) => Number.isFinite(entry.value) && entry.value >= 25 && entry.value <= 350)
    .filter((entry) => !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || entry.date <= todayText)
    .sort((first, second) => first.time - second.time)

  if (weights.length) return weights.at(-1).value

  const profileWeight = parseGoalNumber(profile.currentWeight ?? profile.weight ?? profile.latestWeight)

  return Number.isFinite(profileWeight) && profileWeight >= 25 && profileWeight <= 350
    ? profileWeight
    : null
}

export function parseProteinGoal(value) {
  if (Number.isFinite(value)) {
    return {
      label: `${value.toLocaleString('sv-SE')} g`,
      lower: value,
      target: value,
      upper: value,
    }
  }

  const numbers = String(value ?? '')
    .replace(',', '.')
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter(Number.isFinite) || []

  if (!numbers.length) return null

  const lower = Math.min(...numbers)
  const upper = Math.max(...numbers)

  return {
    label: String(value),
    lower,
    target: lower,
    upper,
  }
}

export function normalizeNutritionGoals(goals = {}, options = {}) {
  if (!isObject(goals)) {
    return {}
  }

  const normalized = {}
  const defaultSource = normalizeSource(goals.goalSource, 'manual')

  Object.keys(nutritionGoalFields).forEach((field) => {
    const config = nutritionGoalFields[field]
    const raw = getFirstValue(goals, field)
    const parsed = parseGoalNumber(raw) ?? parseFirstGoalNumber(raw)

    if (parsed === null || parsed < config.min || parsed > config.max) {
      return
    }

    normalized[field] = field === 'protein' && parseProteinGoal(raw)?.upper > parseProteinGoal(raw)?.lower
      ? String(raw).trim()
      : parsed
    normalized[`${field}Goal${config.unit === 'kcal' ? 'Kcal' : 'Grams'}`] = parsed
    normalized[`${field}GoalSource`] = normalizeSource(goals[`${field}GoalSource`], defaultSource)
  })

  const createdAt = parseDate(goals.createdAt)?.toISOString()
  const updatedAt = parseDate(goals.updatedAt)?.toISOString()

  if (createdAt) normalized.createdAt = createdAt
  if (updatedAt) normalized.updatedAt = updatedAt
  if (!updatedAt && options.touch) normalized.updatedAt = new Date().toISOString()
  if (Object.keys(normalized).some((key) => nutritionGoalFields[key])) {
    normalized.goalSource = normalizeSource(goals.goalSource, defaultSource)
  }

  return normalized
}

export function validateNutritionGoals(goals = {}) {
  const errors = {}

  Object.keys(nutritionGoalFields).forEach((field) => {
    const config = nutritionGoalFields[field]
    const raw = getFirstValue(goals, field)

    if (raw === null || raw === undefined || String(raw).trim() === '') {
      return
    }

    const parsed = parseGoalNumber(raw)

    if (!Number.isFinite(parsed)) {
      errors[field] = `${config.label}et måste vara ett giltigt tal.`
      return
    }

    if (parsed < 0) {
      errors[field] = `${config.label}et får inte vara negativt.`
      return
    }

    if (config.requiredPositive && parsed <= 0) {
      errors[field] = `${config.label}et måste vara större än 0.`
      return
    }

    if (parsed > config.max) {
      errors[field] = `${config.label}et är orimligt högt.`
    }
  })

  return errors
}

export function createUpdatedNutritionGoals(existingGoals = {}, draft = {}, options = {}) {
  const errors = validateNutritionGoals(draft)

  if (Object.keys(errors).length > 0) {
    return {
      errors,
      goals: null,
    }
  }

  const existing = normalizeNutritionGoals(existingGoals)
  const now = options.now || new Date().toISOString()
  const source = normalizeSource(options.source, 'manual')
  const next = {}

  Object.keys(nutritionGoalFields).forEach((field) => {
    const config = nutritionGoalFields[field]
    const raw = getFirstValue(draft, field)

    if (raw === null || raw === undefined || String(raw).trim() === '') {
      return
    }

    const parsed = parseGoalNumber(raw)

    if (Number.isFinite(parsed) && parsed >= config.min && parsed <= config.max) {
      next[field] = parsed
      next[`${field}Goal${config.unit === 'kcal' ? 'Kcal' : 'Grams'}`] = parsed
      next[`${field}GoalSource`] = normalizeSource(draft[`${field}GoalSource`], source)
    }
  })

  if (Object.keys(next).length === 0) {
    return {
      errors: {},
      goals: {},
    }
  }

  return {
    errors: {},
    goals: normalizeNutritionGoals({
      ...next,
      createdAt: existing.createdAt || now,
      goalSource: source,
      updatedAt: now,
    }),
  }
}

export function makeNutritionGoalProgress(value, goal, unit = 'g', label = '') {
  const target = parseGoalNumber(goal?.target ?? goal)
  const safeValue = Number.isFinite(value) && value >= 0 ? value : 0

  if (!Number.isFinite(target) || target <= 0) {
    return {
      hasGoal: false,
      label,
      remaining: 0,
      status: 'missing',
      text: 'Inget mål satt',
      unit,
      value: safeValue,
      valueText: `${Math.round(safeValue).toLocaleString('sv-SE')} ${unit}`,
      visualPercent: 0,
    }
  }

  const percent = Math.round((safeValue / target) * 100)
  const remaining = Math.max(0, Math.round(target - safeValue))
  const reached = safeValue >= target

  return {
    goal: target,
    goalText: `${Math.round(target).toLocaleString('sv-SE')} ${unit}`,
    hasGoal: true,
    label,
    percent,
    remaining,
    status: reached ? 'reached' : 'active',
    text: reached ? 'Målet uppnått' : `${remaining.toLocaleString('sv-SE')} ${unit} kvar`,
    unit,
    value: safeValue,
    valueText: `${Math.round(safeValue).toLocaleString('sv-SE')} ${unit}`,
    visualPercent: clamp(percent, 0, 100),
  }
}

export function calculateProteinGoalContribution(protein, proteinGoal) {
  const goal = parseProteinGoal(proteinGoal)

  if (!goal || !Number.isFinite(protein) || protein <= 0 || goal.target <= 0) {
    return null
  }

  return {
    goal,
    percent: Math.round((protein / goal.target) * 100),
  }
}

export function calculateSuggestedProteinGoal(profile = {}, weightData = {}) {
  const currentWeight = getLatestValidWeight(weightData, profile)

  if (!Number.isFinite(currentWeight)) {
    return null
  }

  const activity = parseActivityLevel(profile.activityLevel || profile.activity)
  const direction = parseGoalDirection(profile, weightData)
  const multiplier = {
    gain: activity === 'high' ? 1.8 : activity === 'low' ? 1.5 : 1.6,
    loss: activity === 'high' ? 1.8 : activity === 'low' ? 1.4 : 1.6,
    maintain: activity === 'high' ? 1.6 : activity === 'low' ? 1.2 : 1.4,
  }[direction]
  const recommended = roundTo(currentWeight * multiplier)
  const minimum = roundTo(currentWeight * Math.max(1.2, multiplier - 0.2))
  const maximum = roundTo(currentWeight * Math.min(2, multiplier + 0.2))

  if (recommended < 40 || recommended > 260) {
    return null
  }

  return {
    assumptions: [
      `Aktivitetsnivå tolkad som ${activity === 'high' ? 'hög' : activity === 'low' ? 'låg' : 'måttlig'}.`,
      `Viktriktning tolkad som ${direction === 'loss' ? 'viktnedgång' : direction === 'gain' ? 'viktuppgång' : 'viktbalans'}.`,
      'Förslaget är generellt och inte medicinsk rådgivning.',
    ],
    explanation: `Ett generellt proteinmål för din vikt och aktivitetsnivå kan ligga runt ${minimum}–${maximum} g per dag.`,
    maximumGrams: maximum,
    minimumGrams: minimum,
    recommendedGrams: recommended,
  }
}

export function calculateSuggestedCalorieGoal(profile = {}, weightData = {}) {
  const weight = getLatestValidWeight(weightData, profile)
  const height = parseGoalNumber(profile.height)
  const age = parseGoalNumber(profile.age)
  const genderText = String(profile.gender || profile.sex || '').toLocaleLowerCase('sv-SE')
  const gender = /kvinna|female|woman/.test(genderText)
    ? 'female'
    : /man|male/.test(genderText)
      ? 'male'
      : ''
  const missingFields = []

  if (!Number.isFinite(weight)) missingFields.push('vikt')
  if (!Number.isFinite(height)) missingFields.push('längd')
  if (!Number.isFinite(age)) missingFields.push('ålder')

  if (missingFields.length || height < 120 || height > 230 || age < 15 || age > 90) {
    return {
      assumptions: [],
      direction: parseGoalDirection(profile, weightData),
      explanation: 'Det finns inte tillräckligt med profiluppgifter för ett rimligt kaloriförslag.',
      maintenanceEstimate: null,
      missingFields,
      rangeMax: null,
      rangeMin: null,
      suggestedGoal: null,
    }
  }

  const activity = parseActivityLevel(profile.activityLevel || profile.activity)
  const activityFactor = activity === 'high' ? 1.55 : activity === 'low' ? 1.25 : 1.4
  const direction = parseGoalDirection(profile, weightData)
  const bmrConstant = gender === 'female' ? -161 : gender === 'male' ? 5 : -78
  const bmr = 10 * weight + 6.25 * height - 5 * age + bmrConstant
  const maintenance = roundTo(bmr * activityFactor, 25)
  const adjustment = direction === 'loss' ? -350 : direction === 'gain' ? 250 : 0
  const suggested = roundTo(maintenance + adjustment, 25)
  const genderFloor = gender === 'female' ? 1200 : gender === 'male' ? 1500 : 1300

  if (maintenance < 1200 || maintenance > 5000 || suggested < genderFloor) {
    return {
      assumptions: ['Uppskattningen skulle bli för osäker eller låg.'],
      direction,
      explanation: 'Kaloriunderlaget ser för osäkert ut, så jag avstår från ett automatiskt kaloriförslag.',
      maintenanceEstimate: maintenance,
      missingFields: [],
      rangeMax: null,
      rangeMin: null,
      suggestedGoal: null,
    }
  }

  return {
    assumptions: [
      `Aktivitetsnivå tolkad som ${activity === 'high' ? 'hög' : activity === 'low' ? 'låg' : 'måttlig'}.`,
      gender ? 'Kön användes endast för energiformeln.' : 'Kön saknas, därför används en försiktig neutral uppskattning.',
      'Förslaget är en generell uppskattning och inte medicinsk rådgivning.',
    ],
    direction,
    explanation: `Ett försiktigt kaloriförslag kan ligga runt ${suggested.toLocaleString('sv-SE')} kcal per dag, baserat på en uppskattad balansnivå runt ${maintenance.toLocaleString('sv-SE')} kcal.`,
    maintenanceEstimate: maintenance,
    missingFields: [],
    rangeMax: roundTo(suggested + 150, 25),
    rangeMin: roundTo(suggested - 150, 25),
    suggestedGoal: suggested,
  }
}

export function buildProteinDistributionPlan(goal, meals = [], options = {}) {
  const parsedGoal = parseProteinGoal(goal)

  if (!parsedGoal?.target) {
    return null
  }

  const date = options.date || new Date().toISOString().slice(0, 10)
  const dayMeals = (Array.isArray(meals) ? meals : []).filter((meal) => String(meal?.date || date).slice(0, 10) === date)
  const eaten = dayMeals.reduce((sum, meal) => sum + (getEffectiveMealNutrition(meal).totals.protein || 0), 0)
  const remaining = Math.max(0, Math.round(parsedGoal.target - eaten))

  if (remaining <= 0) {
    return {
      achieved: true,
      eatenProtein: Math.round(eaten),
      explanation: 'Proteinmålet är redan uppnått idag. Du behöver inte pressa in mer protein för målets skull.',
      remainingProtein: 0,
      targets: [],
    }
  }

  const mealCount = clamp(Number(options.mealCount) || 4, 3, 5)
  const labels = mealCount <= 3
    ? ['Frukost', 'Lunch', 'Middag']
    : ['Frukost', 'Lunch', 'Middag', 'Mellanmål/kvällsmål']
  const base = remaining / labels.length
  const targets = labels.map((label) => {
    const min = Math.max(5, roundTo(base - 5))
    const max = Math.max(min, roundTo(base + 5))

    return {
      label,
      rangeText: `cirka ${min}–${max} g`,
    }
  })

  return {
    achieved: false,
    eatenProtein: Math.round(eaten),
    explanation: remaining <= 20
      ? `Du har ungefär ${remaining} g kvar, så ett litet proteinrikt mellanmål räcker.`
      : `Du har ungefär ${remaining} g protein kvar. Fördela det lugnt över resten av dagen.`,
    remainingProtein: remaining,
    targets,
  }
}
