import { getRecentAiConversation } from './aiConversationMemory.js'
import { getAnalysisHistory } from './bodyAnalysisHistory.js'
import { getMealHistory } from './mealHistory.js'

const DEFAULT_CHECK_IN = {
  energy: null,
  mood: '',
  steps: null,
  workout: false,
}

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

/**
 * Returns a clean array and removes nullish entries.
 *
 * @param {unknown} value
 * @returns {unknown[]}
 */
export function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

/**
 * Parses a finite number from app values such as "84,2 kg".
 *
 * @param {unknown} value
 * @param {number | null} fallback
 * @returns {number | null}
 */
export function safeNumber(value, fallback = null) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback
  }

  const normalized = String(value ?? '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
  const parsed = Number(normalized)

  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Parses a valid Date, otherwise returns fallback.
 *
 * @param {unknown} value
 * @param {Date | null} fallback
 * @returns {Date | null}
 */
export function safeDate(value, fallback = null) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    return fallback
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? fallback : date
}

function safeReadHistory(readHistory) {
  try {
    return safeArray(readHistory())
  } catch {
    return []
  }
}

function formatKg(value) {
  const number = safeNumber(value)

  if (number === null) {
    return 'saknas'
  }

  return `${number.toLocaleString('sv-SE', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })} kg`
}

function formatDateTime(value) {
  const date = safeDate(value)

  if (!date) {
    return 'Datum saknas'
  }

  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(date)
}

function formatInteger(value) {
  const number = safeNumber(value)

  return number === null ? 'Saknas' : Math.round(number).toLocaleString('sv-SE')
}

function includesAny(value, terms) {
  const text = String(value || '').toLocaleLowerCase('sv-SE')

  return terms.some((term) => text.includes(term))
}

function normalizeWeight(entry) {
  const value = safeNumber(entry?.value)

  if (value === null) {
    return null
  }

  const date = safeDate(entry?.date)

  return {
    date: date ? date.toISOString() : null,
    value,
  }
}

function getDateTime(value) {
  return safeDate(value)?.getTime() ?? 0
}

function getWeightStats(weights) {
  const sortedWeights = safeArray(weights)
    .map(normalizeWeight)
    .filter(Boolean)
    .sort((first, second) => getDateTime(first.date) - getDateTime(second.date))
  const first = sortedWeights[0] ?? null
  const latest = sortedWeights.at(-1) ?? null
  const previous = sortedWeights.at(-2) ?? null
  const changeSinceStart =
    first && latest ? Number((latest.value - first.value).toFixed(1)) : null
  const recentChange =
    previous && latest ? Number((latest.value - previous.value).toFixed(1)) : null

  return {
    changeSinceStart,
    current: latest?.value ?? null,
    first: first?.value ?? null,
    hasWeights: sortedWeights.length > 0,
    latestDate: latest?.date ?? null,
    recentChange,
    trend:
      recentChange === null
        ? 'För lite data'
        : recentChange < -0.1
          ? 'Nedåt'
          : recentChange > 0.1
            ? 'Uppåt'
            : 'Stabil',
    weights: sortedWeights,
  }
}

function getNutritionSignals({ foods, mealHistory, meals }) {
  const allText = [
    ...safeArray(foods).map((food) => `${safeText(food?.label)} ${food?.done ? 'done' : ''}`),
    ...safeArray(meals).map((meal) => safeText(meal?.text)),
    ...safeArray(mealHistory).flatMap((entry) => [
      entry?.analysis?.proteinStatus,
      entry?.analysis?.vegetableStatus,
      entry?.analysis?.likelyProtein,
      entry?.analysis?.likelyVegetables,
      entry?.analysis?.summary,
    ]),
  ].join(' ')
  const proteinFood = safeArray(foods).find((food) =>
    includesAny(food?.label, ['protein']),
  )
  const vegetableFood = safeArray(foods).find((food) =>
    includesAny(food?.label, ['grön', 'frukt']),
  )

  return {
    hasProtein:
      Boolean(proteinFood?.done) ||
      includesAny(allText, ['protein', 'ägg', 'kyckling', 'fisk', 'keso', 'kvarg']),
    hasVegetables:
      Boolean(vegetableFood?.done) ||
      includesAny(allText, ['grön', 'grönsak', 'sallad', 'frukt', 'tomat']),
  }
}

function makeScoreFactor(label, points, max, reason, improvement) {
  const safePoints = safeNumber(points, 0) ?? 0
  const safeMax = safeNumber(max, 0) ?? 0

  return {
    improvement,
    label,
    max: safeMax,
    missing: Math.max(safeMax - safePoints, 0),
    points: Math.max(0, Math.min(safePoints, safeMax)),
    reason,
  }
}

function normalizeCheckIn(checkIn) {
  return {
    ...DEFAULT_CHECK_IN,
    ...(checkIn && typeof checkIn === 'object' ? checkIn : {}),
    energy: safeNumber(checkIn?.energy),
    mood: safeText(checkIn?.mood, 'Ej satt'),
    steps: safeNumber(checkIn?.steps),
    workout: Boolean(checkIn?.workout),
  }
}

/**
 * Builds an AI Health Score from local habit signals only.
 *
 * @param {object} payload
 * @returns {{factors: object[], improvement: string, score: number, summary: string}}
 */
export function calculateAiHealthScore(payload = {}) {
  const checkIn = normalizeCheckIn(payload.checkIn)
  const weightStats = getWeightStats(payload.weights)
  const nutrition = getNutritionSignals(payload)
  const foods = safeArray(payload.foods)
  const completedFoods = foods.filter((food) => Boolean(food?.done)).length
  const foodTotal = Math.max(foods.length, 1)
  const energy = checkIn.energy
  const steps = checkIn.steps
  const habitRatio = completedFoods / foodTotal

  const factors = [
    makeScoreFactor(
      'Check-in',
      energy !== null && energy >= 6 ? 12 : energy !== null && energy >= 4 ? 8 : 4,
      12,
      energy !== null
        ? `Energi ${energy}/10 och humör ${checkIn.mood}.`
        : 'Dagens energi saknas.',
      'Gör en komplett check-in med energi, humör och plan.',
    ),
    makeScoreFactor(
      'Vikttrend',
      weightStats.trend === 'Stabil' || weightStats.trend === 'Nedåt'
        ? 15
        : weightStats.recentChange === null
          ? 8
          : 10,
      15,
      weightStats.recentChange === null
        ? 'Minst två viktvärden behövs för trend.'
        : `Senaste trend: ${weightStats.trend.toLocaleLowerCase('sv-SE')}.`,
      'Registrera vikt några gånger i veckan och följ trenden över tid.',
    ),
    makeScoreFactor(
      'Protein',
      nutrition.hasProtein ? 14 : 6,
      14,
      nutrition.hasProtein
        ? 'Protein syns i dagens vanor eller analyser.'
        : 'Proteinstatus är otydlig.',
      'Lägg till en tydlig proteinkälla i nästa måltid.',
    ),
    makeScoreFactor(
      'Grönsaker',
      nutrition.hasVegetables ? 12 : 5,
      12,
      nutrition.hasVegetables
        ? 'Frukt eller grönsaker finns med i signalerna.'
        : 'Grönsaker/frukt saknas i signalerna.',
      'Lägg till frukt, sallad eller frysta grönsaker.',
    ),
    makeScoreFactor(
      'Aktivitet',
      steps !== null && steps >= 8000
        ? 15
        : steps !== null && steps >= 5000
          ? 10
          : checkIn.workout
            ? 10
            : 5,
      15,
      steps !== null
        ? `${formatInteger(steps)} steg${checkIn.workout ? ' och träning markerad' : ''}.`
        : 'Aktivitet saknas i check-in.',
      'Ta en kort promenad eller markera dagens pass.',
    ),
    makeScoreFactor(
      'Sömn/återhämtning',
      energy !== null && energy >= 7 ? 12 : energy !== null && energy >= 4 ? 8 : 4,
      12,
      energy !== null
        ? 'Sömn skattas försiktigt via energi i check-in.'
        : 'Ingen energisignal för återhämtning.',
      'Sikta på en lugn kvällsrutin och följ upp energin i morgon.',
    ),
    makeScoreFactor(
      'Vanepoäng',
      Math.round(habitRatio * 20),
      20,
      `${completedFoods}/${foods.length || 0} matvanor klara.`,
      'Slutför en enkel matvana till i dag.',
    ),
  ]
  const score = Math.max(
    0,
    Math.min(
      100,
      factors.reduce((sum, factor) => sum + factor.points, 0),
    ),
  )
  const improvement = [...factors].sort((first, second) => second.missing - first.missing)[0]

  return {
    factors,
    improvement: improvement?.improvement || 'Behåll dagens stabila rutin.',
    score,
    summary:
      score >= 80
        ? 'Stark dag med flera positiva vanesignaler.'
        : score >= 60
          ? 'Bra grund, med ett tydligt nästa steg.'
          : 'Dashboarden ser en dag där ett litet steg kan göra stor skillnad.',
  }
}

function makeDailyFocus({ checkIn, foods, proactiveCoach }) {
  const missingFood = safeArray(foods).find((food) => !food?.done)
  const steps = safeNumber(checkIn?.steps)
  const coachAction = safeText(proactiveCoach?.nextBestAction)

  if (coachAction) {
    return coachAction
  }

  if (missingFood?.label) {
    return `Gör klart: ${safeText(missingFood.label).toLocaleLowerCase('sv-SE')}.`
  }

  if (steps !== null && steps < 7000) {
    return 'Få in en kort promenad innan dagen stänger.'
  }

  return 'Behåll dagens stabila rutin.'
}

function getLatestInsightCards({
  bodyAnalysisHistory,
  coachMemory,
  mealHistory,
  proactiveCoach,
  weeklyReportData,
  weeklyReportLines,
}) {
  const latestCoach = safeArray(coachMemory)
    .filter((entry) => entry?.role === 'assistant' && safeText(entry?.text))
    .at(-1)
  const latestWeeklyLine = safeArray(weeklyReportLines).find((line) =>
    safeText(line?.text),
  )
  const latestBody = safeArray(bodyAnalysisHistory)[0]
  const latestMeal = safeArray(mealHistory)[0]
  const weeklySummary = safeText(weeklyReportData?.summary)

  return [
    {
      empty: 'Starta AI Coach så visas senaste coachinsikten här.',
      meta: latestCoach ? formatDateTime(latestCoach.createdAt) : '',
      title: 'AI Coach',
      value: safeText(latestCoach?.text) || safeText(proactiveCoach?.nextBestAction),
    },
    {
      empty: 'Skapa en veckorapport för att få veckans sammanfattning.',
      meta: weeklySummary ? 'Senaste rapport' : '',
      title: 'Weekly Report',
      value: weeklySummary || safeText(latestWeeklyLine?.text),
    },
    {
      empty: 'Gör en AI kroppsanalys för att följa visuella framsteg.',
      meta: latestBody ? formatDateTime(latestBody.createdAt) : '',
      title: 'Body Analysis',
      value: safeText(latestBody?.result?.summary) || safeText(latestBody?.status),
    },
    {
      empty: 'Analysera ett matfoto så visas senaste måltidsinsikten här.',
      meta: latestMeal ? formatDateTime(latestMeal.createdAt) : '',
      title: 'Meal Analysis',
      value:
        safeText(latestMeal?.analysis?.summary) ||
        safeText(latestMeal?.analysis?.improvementSuggestion),
    },
  ]
}

function makeActivityItems({ bodyAnalysisHistory, checkIn, mealHistory, weights, weeklyReportData }) {
  const weightItems = safeArray(weights)
    .map(normalizeWeight)
    .filter(Boolean)
    .map((entry) => ({
      detail: `${formatKg(entry.value)} registrerad${entry.date ? '' : ' utan datum'}.`,
      time: entry.date,
      title: 'Vikt registrerad',
      type: 'weight',
    }))
  const mealItems = safeArray(mealHistory).map((entry) => ({
    detail:
      safeText(entry?.analysis?.summary) ||
      safeText(entry?.analysis?.improvementSuggestion) ||
      'Måltid loggad med AI-analys.',
    time: entry?.createdAt,
    title: 'Måltid loggad',
    type: 'meal',
  }))
  const bodyItems = safeArray(bodyAnalysisHistory).map((entry) => ({
    detail:
      safeText(entry?.result?.summary) ||
      safeText(entry?.status) ||
      'Kroppsanalys genomförd.',
    time: entry?.createdAt,
    title: 'Kroppsanalys genomförd',
    type: 'body',
  }))
  const weeklyItems = safeText(weeklyReportData?.summary)
    ? [
      {
        detail: safeText(weeklyReportData.summary, 'AI-rapport skapad.'),
        time: weeklyReportData.createdAt,
        title: 'Veckorapport skapad',
        type: 'weekly',
      },
    ]
    : []
  const checkInItem =
    checkIn.energy !== null || checkIn.steps !== null || checkIn.mood !== 'Ej satt'
      ? {
        detail: `${formatInteger(checkIn.steps)} steg, energi ${
          checkIn.energy ?? 'saknas'
        }/10 och humör ${checkIn.mood}.`,
        time: new Date().toISOString(),
        title: 'Dagens check-in',
        type: 'check-in',
      }
      : null

  return [...weightItems, ...mealItems, ...bodyItems, ...weeklyItems, checkInItem]
    .filter(Boolean)
    .sort((first, second) => getDateTime(second.time) - getDateTime(first.time))
    .slice(0, 8)
    .map((item) => ({
      ...item,
      timeLabel: formatDateTime(item.time),
    }))
}

function makeGoals({ profile, weightStats }) {
  const goalWeight = safeNumber(profile?.goalWeight)
  const currentWeight = weightStats.current
  const remaining =
    goalWeight !== null && currentWeight !== null
      ? Number((currentWeight - goalWeight).toFixed(1))
      : null

  return {
    currentWeight,
    goalWeight,
    nextStep:
      remaining === null
        ? 'Fyll i målvikt och logga vikt för en tydligare plan.'
        : Math.abs(remaining) <= 0.3
          ? 'Fokusera på stabila vanor och följ upp veckosnittet.'
          : weightStats.trend === 'Nedåt'
            ? 'Fortsätt med samma basvana och följ nästa veckosnitt.'
            : 'Välj en måltidsvana att göra enklare i dag.',
    remaining,
    remainingLabel:
      remaining === null
        ? 'Saknas'
        : remaining > 0
          ? `${formatKg(remaining)} kvar`
          : `${formatKg(Math.abs(remaining))} under mål`,
    targetLabel: goalWeight === null ? 'Inte satt' : formatKg(goalWeight),
    trendDirection: weightStats.hasWeights ? weightStats.trend : 'Viktdata saknas',
  }
}

function getSafeProfile(profile) {
  return profile && typeof profile === 'object' ? profile : {}
}

/**
 * Creates all view data for Dashboard V3.
 *
 * @param {object} data
 * @returns {object}
 */
export function createDashboardData(data = {}) {
  const profile = getSafeProfile(data.profile)
  const bodyAnalysisHistory = safeArray(
    data.bodyAnalysisHistory ?? safeReadHistory(getAnalysisHistory),
  )
  const mealHistory = safeArray(data.mealHistory ?? safeReadHistory(getMealHistory))
  const coachMemory = safeArray(
    data.aiCoachMemory ?? safeReadHistory(getRecentAiConversation),
  )
  const checkIn = normalizeCheckIn(data.checkIn)
  const weightStats = getWeightStats(data.weights)
  const healthScore = calculateAiHealthScore({
    checkIn,
    foods: data.foods,
    mealHistory,
    meals: data.meals,
    weights: data.weights,
  })
  const activity = makeActivityItems({
    bodyAnalysisHistory,
    checkIn,
    mealHistory,
    weights: data.weights,
    weeklyReportData: data.weeklyReportData,
  })
  const latestActivity = activity[0]
  const bestFactor = [...healthScore.factors].sort(
    (first, second) => second.points - first.points,
  )[0]

  return {
    activity,
    goals: makeGoals({ profile, weightStats }),
    healthScore,
    hero: {
      focus: makeDailyFocus({
        checkIn,
        foods: data.foods,
        proactiveCoach: data.proactiveCoach,
      }),
      greeting: safeText(profile.name) ? `Hej ${safeText(profile.name)}` : 'Hej',
      risk: safeText(data.proactiveCoach?.dailyRisk) || healthScore.improvement,
      score: healthScore.score,
      strength:
        safeText(data.proactiveCoach?.dailyStrength) ||
        bestFactor?.reason ||
        'Börja med en check-in så får dashboarden bättre signaler.',
    },
    insights: getLatestInsightCards({
      bodyAnalysisHistory,
      coachMemory,
      mealHistory,
      proactiveCoach: data.proactiveCoach,
      weeklyReportData: data.weeklyReportData,
      weeklyReportLines: data.weeklyReportLines,
    }),
    progress: {
      bodyAnalysisCount: bodyAnalysisHistory.length,
      latestActivity: latestActivity
        ? `${latestActivity.title}: ${latestActivity.detail}`
        : 'Ingen aktivitet ännu',
      mealAnalysisCount: mealHistory.length,
      weeklyReportCount:
        data.weeklyReportData || safeArray(data.weeklyReportLines).length > 0 ? 1 : 0,
      weightTrend: weightStats.hasWeights
        ? `${weightStats.trend}${
          weightStats.changeSinceStart === null
            ? ''
            : ` · ${formatKg(weightStats.changeSinceStart)} sedan start`
        }`
        : 'Logga vikt för att se trend',
    },
    today: {
      energy: checkIn.energy,
      energyLabel: checkIn.energy === null ? 'Saknas' : `${checkIn.energy}/10`,
      habitCount: safeArray(data.foods).filter((food) => Boolean(food?.done)).length,
      habitTotal: safeArray(data.foods).length,
      mood: checkIn.mood,
      steps: checkIn.steps,
      stepsLabel: formatInteger(checkIn.steps),
      workout: checkIn.workout,
    },
  }
}
