import { getRecentAiConversation } from './aiConversationMemory.js'
import { getAnalysisHistory } from './bodyAnalysisHistory.js'
import { getMealHistory } from './mealHistory.js'

const DEFAULT_CHECK_IN = {
  energy: 0,
  mood: '',
  steps: 0,
  workout: false,
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function parseWeight(value) {
  const parsed = Number(String(value ?? '').replace(',', '.').replace(' kg', ''))

  return Number.isFinite(parsed) ? parsed : null
}

function formatKg(value) {
  if (!Number.isFinite(value)) {
    return 'saknas'
  }

  return `${value.toLocaleString('sv-SE', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })} kg`
}

function formatDateTime(value) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'nyligen'
  }

  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(date)
}

function includesAny(value, terms) {
  const text = String(value || '').toLocaleLowerCase('sv-SE')

  return terms.some((term) => text.includes(term))
}

function getWeightStats(weights) {
  const sortedWeights = safeArray(weights)
    .filter((entry) => Number.isFinite(Number(entry?.value)))
    .sort((first, second) => new Date(first.date) - new Date(second.date))
  const first = sortedWeights[0] ?? null
  const latest = sortedWeights.at(-1) ?? null
  const previous = sortedWeights.at(-2) ?? null
  const changeSinceStart =
    first && latest ? Number((Number(latest.value) - Number(first.value)).toFixed(1)) : null
  const recentChange =
    previous && latest
      ? Number((Number(latest.value) - Number(previous.value)).toFixed(1))
      : null

  return {
    changeSinceStart,
    current: latest ? Number(latest.value) : null,
    first: first ? Number(first.value) : null,
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
    ...safeArray(foods).map((food) => `${food.label} ${food.done ? 'done' : ''}`),
    ...safeArray(meals).map((meal) => meal.text),
    ...safeArray(mealHistory).flatMap((entry) => [
      entry.analysis?.proteinStatus,
      entry.analysis?.vegetableStatus,
      entry.analysis?.likelyProtein,
      entry.analysis?.likelyVegetables,
      entry.analysis?.summary,
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
  return {
    improvement,
    label,
    max,
    missing: Math.max(max - points, 0),
    points,
    reason,
  }
}

/**
 * Builds an AI Health Score from local habit signals only.
 *
 * @param {object} payload
 * @returns {{factors: object[], improvement: string, score: number, summary: string}}
 */
export function calculateAiHealthScore(payload) {
  const checkIn = { ...DEFAULT_CHECK_IN, ...payload.checkIn }
  const weightStats = getWeightStats(payload.weights)
  const nutrition = getNutritionSignals(payload)
  const foods = safeArray(payload.foods)
  const completedFoods = foods.filter((food) => food?.done).length
  const foodTotal = Math.max(foods.length, 1)
  const energy = Number(checkIn.energy)
  const steps = Number(checkIn.steps)
  const habitRatio = completedFoods / foodTotal

  const factors = [
    makeScoreFactor(
      'Check-in',
      Number.isFinite(energy) && energy >= 6 ? 12 : Number.isFinite(energy) && energy >= 4 ? 8 : 4,
      12,
      Number.isFinite(energy)
        ? `Energi ${energy}/10 och humör ${checkIn.mood || 'ej satt'}.`
        : 'Dagens energi saknas.',
      'Gör en komplett check-in med energi, humör och plan.',
    ),
    makeScoreFactor(
      'Vikttrend',
      weightStats.trend === 'Stabil' || weightStats.trend === 'Nedåt' ? 15 : weightStats.recentChange === null ? 8 : 10,
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
      nutrition.hasProtein ? 'Protein syns i dagens vanor eller analyser.' : 'Proteinstatus är otydlig.',
      'Lägg till en tydlig proteinkälla i nästa måltid.',
    ),
    makeScoreFactor(
      'Grönsaker',
      nutrition.hasVegetables ? 12 : 5,
      12,
      nutrition.hasVegetables ? 'Frukt eller grönsaker finns med i signalerna.' : 'Grönsaker/frukt saknas i signalerna.',
      'Lägg till frukt, sallad eller frysta grönsaker.',
    ),
    makeScoreFactor(
      'Aktivitet',
      Number.isFinite(steps) && steps >= 8000 ? 15 : Number.isFinite(steps) && steps >= 5000 ? 10 : checkIn.workout ? 10 : 5,
      15,
      Number.isFinite(steps)
        ? `${steps.toLocaleString('sv-SE')} steg${checkIn.workout ? ' och träning markerad' : ''}.`
        : 'Aktivitet saknas i check-in.',
      'Ta en kort promenad eller markera dagens pass.',
    ),
    makeScoreFactor(
      'Sömn/återhämtning',
      Number.isFinite(energy) && energy >= 7 ? 12 : Number.isFinite(energy) && energy >= 4 ? 8 : 4,
      12,
      Number.isFinite(energy)
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
  const steps = Number(checkIn?.steps)

  if (proactiveCoach?.nextBestAction) {
    return proactiveCoach.nextBestAction
  }

  if (missingFood?.label) {
    return `Gör klart: ${missingFood.label.toLocaleLowerCase('sv-SE')}.`
  }

  if (Number.isFinite(steps) && steps < 7000) {
    return 'Få in en kort promenad innan dagen stänger.'
  }

  return 'Behåll dagens stabila rutin.'
}

function getLatestInsightCards({ bodyAnalysisHistory, coachMemory, mealHistory, proactiveCoach, weeklyReportData, weeklyReportLines }) {
  const latestCoach = safeArray(coachMemory).filter((entry) => entry.role === 'assistant').at(-1)
  const latestWeeklyLine = safeArray(weeklyReportLines).find((line) => line.text)
  const latestBody = safeArray(bodyAnalysisHistory)[0]
  const latestMeal = safeArray(mealHistory)[0]

  return [
    {
      empty: 'Starta AI Coach så visas senaste coachinsikten här.',
      meta: latestCoach ? formatDateTime(latestCoach.createdAt) : '',
      title: 'AI Coach',
      value: latestCoach?.text || proactiveCoach?.nextBestAction || '',
    },
    {
      empty: 'Skapa en veckorapport för att få veckans sammanfattning.',
      meta: weeklyReportData ? 'Senaste rapport' : '',
      title: 'Weekly Report',
      value: weeklyReportData?.summary || latestWeeklyLine?.text || '',
    },
    {
      empty: 'Gör en AI kroppsanalys för att följa visuella framsteg.',
      meta: latestBody ? formatDateTime(latestBody.createdAt) : '',
      title: 'Body Analysis',
      value: latestBody?.result?.summary || latestBody?.status || '',
    },
    {
      empty: 'Analysera ett matfoto så visas senaste måltidsinsikten här.',
      meta: latestMeal ? formatDateTime(latestMeal.createdAt) : '',
      title: 'Meal Analysis',
      value: latestMeal?.analysis?.summary || latestMeal?.analysis?.improvementSuggestion || '',
    },
  ]
}

function makeActivityItems({ bodyAnalysisHistory, checkIn, mealHistory, weights, weeklyReportData }) {
  return [
    ...safeArray(weights).map((entry) => ({
      detail: `${formatKg(Number(entry.value))} registrerad.`,
      time: entry.date,
      title: 'Vikt registrerad',
      type: 'weight',
    })),
    ...safeArray(mealHistory).map((entry) => ({
      detail: entry.analysis?.summary || 'Måltid loggad med AI-analys.',
      time: entry.createdAt,
      title: 'Måltid loggad',
      type: 'meal',
    })),
    ...safeArray(bodyAnalysisHistory).map((entry) => ({
      detail: entry.result?.summary || entry.status || 'Kroppsanalys genomförd.',
      time: entry.createdAt,
      title: 'Kroppsanalys genomförd',
      type: 'body',
    })),
    weeklyReportData
      ? {
        detail: weeklyReportData.summary || 'AI-rapport skapad.',
        time: weeklyReportData.createdAt || new Date().toISOString(),
        title: 'AI-rapport skapad',
        type: 'weekly',
      }
      : null,
    checkIn
      ? {
        detail: `${Number(checkIn.steps || 0).toLocaleString('sv-SE')} steg och energi ${checkIn.energy ?? '-'}/10.`,
        time: new Date().toISOString(),
        title: 'Check-in uppdaterad',
        type: 'check-in',
      }
      : null,
  ]
    .filter(Boolean)
    .sort((first, second) => new Date(second.time) - new Date(first.time))
    .slice(0, 8)
    .map((item) => ({
      ...item,
      timeLabel: formatDateTime(item.time),
    }))
}

function makeGoals({ profile, weightStats }) {
  const goalWeight = parseWeight(profile?.goalWeight)
  const currentWeight = weightStats.current
  const remaining =
    Number.isFinite(goalWeight) && Number.isFinite(currentWeight)
      ? Number((currentWeight - goalWeight).toFixed(1))
      : null

  return {
    currentWeight,
    goalWeight,
    nextStep:
      remaining === null
        ? 'Fyll i målvikt i profilen för en tydligare plan.'
        : Math.abs(remaining) <= 0.3
          ? 'Fokusera på stabila vanor och följ upp veckosnittet.'
          : weightStats.trend === 'Nedåt'
            ? 'Fortsätt med samma basvana och följ nästa veckosnitt.'
            : 'Välj en måltidsvana att göra enklare i dag.',
    remaining,
    remainingLabel:
      remaining === null
        ? 'saknas'
        : remaining > 0
          ? `${formatKg(remaining)} kvar`
          : `${formatKg(Math.abs(remaining))} under mål`,
    targetLabel: goalWeight ? formatKg(goalWeight) : 'Inte satt',
    trendDirection: weightStats.trend,
  }
}

/**
 * Creates all view data for Dashboard V3.
 *
 * @param {object} data
 * @returns {object}
 */
export function createDashboardData(data = {}) {
  const bodyAnalysisHistory = safeArray(data.bodyAnalysisHistory ?? getAnalysisHistory())
  const mealHistory = safeArray(data.mealHistory ?? getMealHistory())
  const coachMemory = safeArray(data.aiCoachMemory ?? getRecentAiConversation())
  const checkIn = { ...DEFAULT_CHECK_IN, ...data.checkIn }
  const weightStats = getWeightStats(data.weights)
  const healthScore = calculateAiHealthScore({
    checkIn,
    foods: data.foods,
    mealHistory,
    meals: data.meals,
    weights: data.weights,
  })
  const latestActivity = makeActivityItems({
    bodyAnalysisHistory,
    checkIn,
    mealHistory,
    weights: data.weights,
    weeklyReportData: data.weeklyReportData,
  })[0]

  return {
    activity: makeActivityItems({
      bodyAnalysisHistory,
      checkIn,
      mealHistory,
      weights: data.weights,
      weeklyReportData: data.weeklyReportData,
    }),
    goals: makeGoals({ profile: data.profile, weightStats }),
    healthScore,
    hero: {
      focus: makeDailyFocus({
        checkIn,
        foods: data.foods,
        proactiveCoach: data.proactiveCoach,
      }),
      greeting: data.profile?.name ? `Hej ${data.profile.name}` : 'Hej',
      risk: data.proactiveCoach?.dailyRisk || healthScore.improvement,
      score: healthScore.score,
      strength:
        data.proactiveCoach?.dailyStrength ||
        healthScore.factors.sort((first, second) => second.points - first.points)[0]?.reason ||
        'Du har börjat samla bra signaler.',
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
      latestActivity: latestActivity?.title || 'Ingen aktivitet ännu',
      mealAnalysisCount: mealHistory.length,
      weeklyReportCount: data.weeklyReportData || safeArray(data.weeklyReportLines).length > 0 ? 1 : 0,
      weightTrend: `${weightStats.trend}${weightStats.changeSinceStart === null ? '' : ` · ${formatKg(weightStats.changeSinceStart)} sedan start`}`,
    },
    today: {
      energy: checkIn.energy,
      habitCount: safeArray(data.foods).filter((food) => food?.done).length,
      habitTotal: safeArray(data.foods).length,
      mood: checkIn.mood || 'Ej satt',
      steps: Number(checkIn.steps || 0),
      workout: Boolean(checkIn.workout),
    },
  }
}
