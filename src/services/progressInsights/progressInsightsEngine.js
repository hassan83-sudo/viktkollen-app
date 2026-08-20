import { buildProgressDashboardAnalytics } from '../progress/progressAnalytics.js'

export const progressInsightTypes = Object.freeze({
  insufficient: 'INSUFFICIENT_DATA',
  needsAttention: 'NEEDS_ATTENTION',
  positiveTrend: 'POSITIVE_TREND',
  stable: 'STABLE',
})

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(String(value).replace(',', '.').replace(/[^\d.-]/g, ''))

  return Number.isFinite(number) ? number : null
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits

  return Math.round((value + Number.EPSILON) * factor) / factor
}

function formatKg(value) {
  const number = safeNumber(value)
  if (number === null) return 'saknas'

  return `${Math.abs(number).toLocaleString('sv-SE', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })} kg`
}

function formatSignedKg(value) {
  const number = safeNumber(value)
  if (number === null) return 'Saknas'
  if (Math.abs(number) < 0.05) return '0,0 kg'

  return `${number > 0 ? '+' : '-'}${formatKg(number)}`
}

function formatSteps(value) {
  const number = safeNumber(value)
  if (number === null) return 'saknas'

  return `${Math.round(number).toLocaleString('sv-SE')} steg/dag`
}

function getGoalDirection(profile = {}) {
  const direction = String(profile.weightDirection || profile.goalDirection || '').toLocaleLowerCase('sv-SE')
  if (direction === 'maintain') return 'stable'
  if (direction === 'gain') return 'up'
  if (direction === 'loss') return 'down'

  const goal = String(profile.goal || '').toLocaleLowerCase('sv-SE')
  if (/bygga|upp|muskel/.test(goal)) return 'up'
  if (/håll|hall|maintain|stabil/.test(goal)) return 'stable'

  return 'down'
}

function isWeightTrendTowardGoal(changeKg, profile) {
  const goalDirection = getGoalDirection(profile)

  if (!Number.isFinite(changeKg) || Math.abs(changeKg) < 0.1) return false
  if (goalDirection === 'stable') return Math.abs(changeKg) <= 0.3
  return goalDirection === 'down' ? changeKg < 0 : changeKg > 0
}

function getConfidence({ checkInDays = 0, mealDays = 0, weightDays = 0 }) {
  const dataDays = Math.max(checkInDays, mealDays, weightDays)
  const signalCount = [checkInDays > 0, mealDays > 0, weightDays > 0].filter(Boolean).length
  const level = dataDays >= 18 && signalCount >= 2
    ? 'Hög'
    : dataDays >= 7 || signalCount >= 2
      ? 'Medel'
      : dataDays > 0
        ? 'Låg'
        : 'Låg'

  return {
    dataDays,
    label: level,
    text: `${level} confidence - ${dataDays} dagar med data`,
  }
}

function createInsight({
  action = '',
  evidence = [],
  id,
  priority = 50,
  title,
  type,
  why,
}) {
  return {
    action,
    evidence: safeArray(evidence),
    id,
    priority,
    title,
    type,
    why,
  }
}

function getPeriodModel(data, period, options) {
  return buildProgressDashboardAnalytics(data, {
    period,
    today: options.today || data.today || options.analysisDate,
  })
}

function getComparisonText(current, previous, unit = '') {
  const delta = current - previous
  const prefix = delta > 0 ? '+' : ''

  return `${prefix}${Math.round(delta).toLocaleString('sv-SE')}${unit}`
}

function buildBodyScanInsight({ bodyAnalysisHistory = [], progressPhotoItems = [] }) {
  const bodyCount = safeArray(bodyAnalysisHistory).length
  const photoCount = safeArray(progressPhotoItems).length

  if (bodyCount >= 2) {
    return createInsight({
      evidence: [`${bodyCount} kroppsscanningar finns sparade som metadata.`],
      id: 'body-scan-history',
      priority: 45,
      title: `Du har genomfört ${bodyCount} kroppsscanningar.`,
      type: progressInsightTypes.stable,
      why: 'Body Scan-historik används bara som antal och datum, inte som ny bildanalys.',
    })
  }

  if (photoCount >= 2) {
    return createInsight({
      evidence: [`${photoCount} framstegsbilder finns sparade.`],
      id: 'progress-photo-metadata',
      priority: 35,
      title: `Du har ${photoCount} sparade framstegsbilder.`,
      type: progressInsightTypes.stable,
      why: 'Progress Photos används endast som metadata här, aldrig som rå bildtolkning.',
    })
  }

  return null
}

function buildWeightInsights({ current30, current7, data, previous30 }) {
  const insights = []
  const weight30 = current30.weight
  const change30 = safeNumber(weight30.periodChangeKg)
  const weeklyChange = safeNumber(weight30.weeklyAverageChange)

  if (weight30.registrationCount < 2) {
    insights.push(createInsight({
      action: 'Logga vikten ytterligare två gånger den här veckan för en tydligare trend.',
      evidence: [`${weight30.registrationCount} viktregistreringar i vald 30-dagarsperiod.`],
      id: 'weight-insufficient',
      priority: 68,
      title: 'Fler registrerade vikter behövs för att bedöma trenden.',
      type: progressInsightTypes.insufficient,
      why: 'Vikttrend kräver minst två mätpunkter så saknad data inte misstolkas som 0.',
    }))
    return insights
  }

  if (Math.abs(change30) <= 0.3 && weight30.registrationCount >= 4) {
    insights.push(createInsight({
      action: 'Följ helheten med mat, steg och sömn innan du tolkar vågen för hårt.',
      evidence: [`Viktförändring ${formatSignedKg(change30)} på ${weight30.registrationCount} registreringar.`],
      id: 'weight-plateau',
      priority: 88,
      title: 'Möjlig platå: vikten har förändrats väldigt lite senaste perioden.',
      type: progressInsightTypes.stable,
      why: 'Dagliga viktvariationer är normala. Signalen visas försiktigt först när flera viktpunkter finns.',
    }))
  }

  if (Number.isFinite(weeklyChange) && Math.abs(weeklyChange) >= 1.5) {
    insights.push(createInsight({
      action: 'Bedöm sammanhanget lugnt och kontakta vården vid oro eller om förändringen känns svår att förklara.',
      evidence: [`Nuvarande trend motsvarar ungefär ${formatSignedKg(weeklyChange)} per vecka.`],
      id: 'weight-fast-change',
      priority: 95,
      title: 'Din vikt har förändrats snabbare än vanligt den senaste perioden.',
      type: progressInsightTypes.needsAttention,
      why: 'Snabb viktförändring kan bero på många saker, till exempel vätska, rutiner eller registreringsmönster.',
    }))
  }

  if (isWeightTrendTowardGoal(change30, data.profile)) {
    insights.push(createInsight({
      action: 'Fortsätt med samma lugna basrutiner och följ veckosnittet.',
      evidence: [`Vikttrend ${formatSignedKg(change30)} senaste 30 dagarna.`],
      id: 'weight-positive',
      priority: 70,
      title: `Din vikttrend går gradvis mot ditt mål: ${formatKg(change30)} senaste 30 dagarna.`,
      type: progressInsightTypes.positiveTrend,
      why: 'Riktningen jämförs mot din målbild och baseras på registrerade viktvärden i perioden.',
    }))
  } else if (Math.abs(change30) <= 0.6) {
    insights.push(createInsight({
      action: 'Fortsätt väga dig regelbundet och jämför trenden över flera veckor.',
      evidence: [`Viktförändring ${formatSignedKg(change30)} senaste 30 dagarna.`],
      id: 'weight-stable',
      priority: 55,
      title: 'Vikten har varit relativt stabil den senaste perioden.',
      type: progressInsightTypes.stable,
      why: 'Stabil vikt betyder liten förändring mellan första och senaste registrerade värde i perioden.',
    }))
  }

  const previousChange = safeNumber(previous30.weight?.periodChangeKg)
  if (Number.isFinite(change30) && Number.isFinite(previousChange)) {
    insights.push(createInsight({
      evidence: [
        `Senaste 30 dagar: ${formatSignedKg(change30)}.`,
        `Föregående 30 dagar: ${formatSignedKg(previousChange)}.`,
      ],
      id: 'weight-30-comparison',
      priority: 50,
      title: `Vikttrend 30 dagar jämfört med föregående period: ${formatSignedKg(round(change30 - previousChange))}.`,
      type: Math.abs(change30 - previousChange) <= 0.2 ? progressInsightTypes.stable : progressInsightTypes.positiveTrend,
      why: 'Jämförelsen använder bara perioder där båda perioderna har viktvärden.',
    }))
  }

  const change7 = safeNumber(current7.weight?.periodChangeKg)
  if (Number.isFinite(change7) && Math.abs(change7) >= 0.1) {
    insights.push(createInsight({
      evidence: [`Senaste 7 dagar: ${formatSignedKg(change7)}.`],
      id: 'weight-7',
      priority: 48,
      title: `Senaste veckan visar ${formatSignedKg(change7)} i vikttrend.`,
      type: progressInsightTypes.stable,
      why: 'Veckotrenden visas som kort signal och bör tolkas försiktigt.',
    }))
  }

  return insights
}

function buildNutritionInsights({ current30 }) {
  const insights = []
  const comparison = current30.comparison || {}
  const nutrition = current30.nutrition || {}
  const proteinDelta = safeNumber(comparison.proteinGoalPercentDelta)

  if (!nutrition.loggedDayCount) {
    insights.push(createInsight({
      action: 'Logga två vanliga måltidsdagar för tydligare kostmönster.',
      evidence: ['0 registrerade måltidsdagar i perioden.'],
      id: 'nutrition-insufficient',
      priority: 12,
      title: 'Fler måltidsdagar behövs för nutritionstrenden.',
      type: progressInsightTypes.insufficient,
      why: 'Saknade måltidsdagar räknas inte som 0.',
    }))
    return insights
  }

  if (Number.isFinite(proteinDelta)) {
    insights.push(createInsight({
      action: proteinDelta >= 0
        ? 'Försök nå proteinmålet även i morgon.'
        : 'Planera en tydlig proteinkälla i nästa måltid.',
      evidence: [
        `Proteinmål nås ${nutrition.proteinGoalDays} av ${nutrition.loggedDayCount} registrerade dagar.`,
        `Förändring mot föregående period: ${getComparisonText(proteinDelta, 0, ' procentenheter')}.`,
      ],
      id: 'protein-comparison',
      priority: proteinDelta < -10 ? 82 : 62,
      title: proteinDelta >= 0
        ? 'Du når proteinmålet oftare än föregående period.'
        : 'Proteinmålet nås mer sällan än tidigare.',
      type: proteinDelta < -10 ? progressInsightTypes.needsAttention : progressInsightTypes.positiveTrend,
      why: 'Protein jämförs bara mellan registrerade måltidsdagar, inte mot saknade dagar.',
    }))
  } else if (nutrition.proteinGoalPercent >= 70) {
    insights.push(createInsight({
      action: 'Behåll ungefär samma proteinrytm kommande vecka.',
      evidence: [`${nutrition.proteinGoalPercent}% av registrerade dagar når proteinmålet.`],
      id: 'protein-positive',
      priority: 58,
      title: 'Proteinmålet nås ofta på registrerade dagar.',
      type: progressInsightTypes.positiveTrend,
      why: 'Andelen beräknas på dagar där måltider faktiskt är loggade.',
    }))
  }

  return insights
}

function buildActivityInsights({ current30 }) {
  const insights = []
  const comparison = current30.comparison || {}
  const habits = current30.habits || {}
  const stepDelta = safeNumber(comparison.stepAverageDelta)
  const checkInDelta = safeNumber(comparison.checkInDelta)
  const averageSteps = safeNumber(habits.averageSteps)

  if (Number.isFinite(stepDelta)) {
    insights.push(createInsight({
      action: stepDelta >= 0
        ? 'Fortsätt med ungefär samma vardagsaktivitet.'
        : 'Välj en liten promenad som känns lätt att upprepa.',
      evidence: [
        `Snittsteg nu: ${formatSteps(averageSteps)}.`,
        `Skillnad mot föregående period: ${stepDelta > 0 ? '+' : ''}${Math.round(stepDelta).toLocaleString('sv-SE')} steg/dag.`,
      ],
      id: 'steps-comparison',
      priority: stepDelta < -1000 ? 78 : 60,
      title: stepDelta >= 0
        ? `Aktiviteten har ökat med cirka ${Math.round(stepDelta).toLocaleString('sv-SE')} steg/dag.`
        : `Stegen är lägre än föregående period med cirka ${Math.abs(Math.round(stepDelta)).toLocaleString('sv-SE')} steg/dag.`,
      type: stepDelta < -1000 ? progressInsightTypes.needsAttention : progressInsightTypes.positiveTrend,
      why: 'Stegjämförelsen använder bara dagar med check-in/stegdata.',
    }))
  }

  if (Number.isFinite(checkInDelta)) {
    insights.push(createInsight({
      action: checkInDelta >= 0
        ? 'Fortsätt med korta check-ins när det passar.'
        : 'Gör en kort check-in idag för bättre trendunderlag.',
      evidence: [`Check-ins: ${habits.checkInCount} i perioden, förändring ${checkInDelta > 0 ? '+' : ''}${checkInDelta}.`],
      id: 'checkin-comparison',
      priority: checkInDelta < 0 ? 54 : 42,
      title: checkInDelta >= 0 ? 'Check-ins är minst lika regelbundna som tidigare.' : 'Check-ins är färre än föregående period.',
      type: checkInDelta >= 0 ? progressInsightTypes.stable : progressInsightTypes.needsAttention,
      why: 'Check-ins används för datatäckning och aktivitetsmönster, inte som bedömning av prestation.',
    }))
  }

  return insights
}

function buildNextBestAction(insights, confidence) {
  const actionInsight = safeArray(insights).find((insight) => insight.action)
  if (actionInsight) return actionInsight.action
  if (confidence.dataDays < 5) return 'Logga vikt, måltid eller check-in några dagar till för tydligare insikter.'

  return 'Fortsätt med samma basrutiner och följ trenden igen om några dagar.'
}

export function buildProgressInsightsModel(data = {}, options = {}) {
  const period = options.period || data.period || '30d'
  const current30 = getPeriodModel(data, period, options)
  const current7 = getPeriodModel(data, '7d', options)
  const previous30 = current30.comparison?.hasComparison
    ? getPeriodModel({
      ...data,
      today: current30.period.previousEnd,
    }, period, { ...options, today: current30.period.previousEnd })
    : { weight: {}, nutrition: {}, habits: {} }
  const coverage = {
    checkInDays: current30.habits?.checkInCount || 0,
    mealDays: current30.nutrition?.loggedDayCount || 0,
    weightDays: current30.weight?.registrationCount || 0,
  }
  const confidence = getConfidence(coverage)
  const bodyInsight = buildBodyScanInsight(data)
  const candidates = [
    ...buildWeightInsights({ current30, current7, data, previous30 }),
    ...buildNutritionInsights({ current30 }),
    ...buildActivityInsights({ current30 }),
    bodyInsight,
  ].filter(Boolean)
  const sorted = candidates
    .sort((first, second) => second.priority - first.priority || first.title.localeCompare(second.title, 'sv-SE'))
  const mainInsights = sorted.slice(0, 3)

  return {
    allInsights: sorted,
    comparison: {
      checkInDelta: current30.comparison?.checkInDelta ?? null,
      hasComparison: Boolean(current30.comparison?.hasComparison),
      proteinGoalPercentDelta: current30.comparison?.proteinGoalPercentDelta ?? null,
      weightChangeDelta: current30.comparison?.weightChangeDelta ?? null,
    },
    confidence,
    coverage,
    facts: {
      averageSteps: current30.habits?.averageSteps ?? null,
      bodyScanCount: safeArray(data.bodyAnalysisHistory).length,
      checkInDays: coverage.checkInDays,
      mealDays: coverage.mealDays,
      photoCount: safeArray(data.progressPhotoItems).length,
      proteinGoalDays: current30.nutrition?.proteinGoalDays ?? 0,
      proteinLoggedDays: current30.nutrition?.loggedDayCount ?? 0,
      weightChange30d: current30.weight?.periodChangeKg ?? null,
      weightDays: coverage.weightDays,
    },
    mainInsights,
    nextBestAction: buildNextBestAction(mainInsights, confidence),
    period,
    source: 'deterministic',
  }
}
