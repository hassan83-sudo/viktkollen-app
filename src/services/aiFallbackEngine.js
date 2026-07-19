import { formatKg } from './healthCalculations.js'

function getGeneratedAt() {
  return new Date().toISOString()
}

function getWeightSummary(context = {}) {
  const currentWeight = context.weight?.currentWeight
  const change = context.weight?.changeSinceStart

  if (!Number.isFinite(currentWeight)) {
    return 'Viktdata saknas eller är ofullständig.'
  }

  if (!Number.isFinite(change)) {
    return `Senaste vikt är ${formatKg(currentWeight)}.`
  }

  const trend = change < 0
    ? `ned ${formatKg(Math.abs(change))}`
    : change > 0
      ? `upp ${formatKg(change)}`
      : 'stabil'

  return `Senaste vikt är ${formatKg(currentWeight)} och trenden är ${trend} sedan start.`
}

function getMealSummary(context = {}) {
  const mealCount = context.meals?.loggedMealsToday?.length || 0
  const analysisCount = context.meals?.totalAnalyses || 0

  if (analysisCount > 0) {
    return `${analysisCount} matanalyser finns i historiken och ${mealCount} måltider är loggade idag.`
  }

  return mealCount > 0
    ? `${mealCount} måltider är loggade idag.`
    : 'Matmönstret blir tydligare när fler måltider loggas.'
}

function getRecoverySummary(context = {}) {
  const energy = Number(context.checkIn?.energy)

  return Number.isFinite(energy) && energy <= 4
    ? 'Energin verkar låg, så återhämtning och enkelhet bör prioriteras.'
    : 'Återhämtningen kan hållas stabil med sömn, lugn kvällsrutin och lagom rörelse.'
}

/**
 * Creates the shared AI response model used across AI features.
 *
 * @param {object} response
 * @returns {object}
 */
export function createAiResponseModel(response = {}) {
  return {
    actions: Array.isArray(response.actions) ? response.actions : [],
    confidence: response.confidence || 'medel',
    followUp: response.followUp || '',
    generatedAt: response.generatedAt || getGeneratedAt(),
    source: response.source || 'mock',
    sourceReason: response.sourceReason || 'local_fallback',
    status: response.status || 'completed',
    summary: response.summary || '',
    title: response.title || 'AI-svar',
    warnings: Array.isArray(response.warnings) ? response.warnings : [],
  }
}

/**
 * Creates a smart local fallback response for a given AI feature.
 *
 * @param {object} params
 * @param {string} params.feature
 * @param {string} [params.intent]
 * @param {object} params.userContext
 * @returns {object}
 */
export function createAiFallback({ feature, intent = 'general', userContext }) {
  const context = userContext || {}
  const summaries = {
    bodyAnalysis:
      context.bodyAnalysis?.latestAnalysis?.result?.summary ||
      'Kroppsanalysen kan följa förändringar över tid när fler analyser finns.',
    coach:
      intent === 'weight'
        ? getWeightSummary(context)
        : intent === 'food'
          ? getMealSummary(context)
          : getRecoverySummary(context),
    mealAnalysis:
      'Måltidsanalysen är en uppskattning. Fokusera på protein, grönsaker/frukt och rimlig portion.',
    proactiveCoach:
      'Dagens bästa fokus är ett litet steg som går att upprepa: protein, vatten, rörelse eller återhämtning.',
    weeklyReport:
      `${getWeightSummary(context)} ${getMealSummary(context)} ${getRecoverySummary(context)}`,
  }
  const actions = {
    bodyAnalysis: ['Ta nästa analys med samma ljus och avstånd.'],
    coach: ['Välj ett litet nästa steg idag.'],
    mealAnalysis: ['Lägg till protein eller grönsaker om måltiden saknar balans.'],
    proactiveCoach: ['Gör nästa vana enkel och konkret.'],
    weeklyReport: ['Upprepa en matvana, en rörelsevana och en återhämtningsvana.'],
  }

  return createAiResponseModel({
    actions: actions[feature] || actions.coach,
    confidence: 'medel',
    followUp: 'Vill du att jag gör nästa steg mer konkret?',
    source: 'mock',
    sourceReason: 'smart_local_fallback',
    summary: summaries[feature] || summaries.coach,
    title: feature === 'weeklyReport'
      ? 'Veckans AI-sammanfattning'
      : feature === 'proactiveCoach'
        ? 'Dagens AI-fokus'
        : 'AI-sammanfattning',
    warnings: ['Detta är allmän vägledning och inte medicinsk rådgivning.'],
  })
}
