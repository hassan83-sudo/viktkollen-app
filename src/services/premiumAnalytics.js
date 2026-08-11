import { readStorage, writeStorage } from './appStorageService.js'
import { defaultPremiumPricing } from './premiumPricing.js'

export const premiumAnalyticsStorageKey = 'viktkollen.premiumAnalytics.v1'
export const premiumAnalyticsChangedEvent = 'viktkollen:premium-analytics-changed'

export const premiumAnalyticsCounters = Object.freeze({
  aiCoachMessages: 'aiCoachMessages',
  aiVoiceReplies: 'aiVoiceReplies',
  bodyScans: 'bodyScans',
  nutritionAnalyses: 'nutritionAnalyses',
  voiceSessions: 'voiceSessions',
})

export const emptyPremiumAnalyticsCounters = Object.freeze({
  aiCoachMessages: 0,
  aiVoiceReplies: 0,
  bodyScans: 0,
  nutritionAnalyses: 0,
  voiceSessions: 0,
})

export const premiumAnalyticsScenarios = defaultPremiumPricing.scenarios

function getUserKey(userId) {
  return String(userId || 'local-user')
}

function normalizeCount(value) {
  const number = Number(value)

  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0
}

function normalizeRate(value) {
  const number = Number(value)

  return Number.isFinite(number) && number > 0 ? number : 0
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function roundRatio(value) {
  return Math.round(Number(value || 0) * 1000) / 1000
}

function getPremiumPriceSek(pricing = defaultPremiumPricing) {
  return Number(
    pricing.subscription?.premiumPriceSek ??
    pricing.monthlyPriceSek ??
    defaultPremiumPricing.subscription.premiumPriceSek,
  )
}

function getUsdToSek(pricing = defaultPremiumPricing) {
  return Number(pricing.exchange?.usdToSek ?? defaultPremiumPricing.exchange.usdToSek)
}

function getAiPricing(pricing, key) {
  return {
    ...defaultPremiumPricing.ai[key],
    ...(pricing.ai?.[key] || {}),
  }
}

function getVoicePricing(pricing, key) {
  return {
    ...defaultPremiumPricing.voice[key],
    ...(pricing.voice?.[key] || {}),
  }
}

function getInfrastructurePricing(pricing = defaultPremiumPricing) {
  return {
    ...defaultPremiumPricing.infrastructure,
    ...(pricing.infrastructure || {}),
  }
}

function getPaymentsPricing(pricing = defaultPremiumPricing) {
  return {
    ...defaultPremiumPricing.payments,
    ...(pricing.payments || {}),
  }
}

export function normalizePremiumAnalyticsCounters(value = {}) {
  return Object.fromEntries(
    Object.keys(emptyPremiumAnalyticsCounters).map((key) => [
      key,
      normalizeCount(value?.[key]),
    ]),
  )
}

export function normalizePremiumAnalyticsState(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const users = source.users && typeof source.users === 'object' ? source.users : {}

  return {
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : '',
    users: Object.fromEntries(
      Object.entries(users).map(([userId, counters]) => [
        getUserKey(userId),
        normalizePremiumAnalyticsCounters(counters),
      ]),
    ),
    version: 1,
  }
}

function notifyPremiumAnalyticsChanged(userId) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return

  const EventConstructor = window.CustomEvent || (typeof CustomEvent === 'function' ? CustomEvent : null)
  if (!EventConstructor) return

  window.dispatchEvent(new EventConstructor(premiumAnalyticsChangedEvent, {
    detail: { userId: getUserKey(userId) },
  }))
}

export function readPremiumAnalyticsState(storage = { read: readStorage }) {
  return normalizePremiumAnalyticsState(
    storage.read
      ? storage.read(premiumAnalyticsStorageKey, { users: {}, version: 1 })
      : readStorage(premiumAnalyticsStorageKey, { users: {}, version: 1 }),
  )
}

export function writePremiumAnalyticsState(state, storage = { write: writeStorage }) {
  const normalizedState = normalizePremiumAnalyticsState(state)
  const payload = {
    ...normalizedState,
    updatedAt: new Date().toISOString(),
  }

  if (storage.write) {
    storage.write(premiumAnalyticsStorageKey, payload)
  } else {
    writeStorage(premiumAnalyticsStorageKey, payload)
  }

  return payload
}

export function incrementPremiumAnalyticsCounter(counter, {
  amount = 1,
  storage,
  userId,
} = {}) {
  if (!Object.values(premiumAnalyticsCounters).includes(counter)) {
    return readPremiumAnalyticsState(storage)
  }

  const userKey = getUserKey(userId)
  const state = readPremiumAnalyticsState(storage)
  const currentCounters = normalizePremiumAnalyticsCounters(state.users[userKey])
  const nextState = writePremiumAnalyticsState({
    ...state,
    users: {
      ...state.users,
      [userKey]: {
        ...currentCounters,
        [counter]: currentCounters[counter] + normalizeCount(amount || 1),
      },
    },
  }, storage)

  notifyPremiumAnalyticsChanged(userKey)
  return nextState
}

export function getPremiumAnalyticsCounters(userId, storage) {
  const state = readPremiumAnalyticsState(storage)

  return normalizePremiumAnalyticsCounters(state.users[getUserKey(userId)])
}

export function calculateTokenCostSek({
  inputTokens = 0,
  outputTokens = 0,
  pricePerMillionInputTokensUsd = 0,
  pricePerMillionOutputTokensUsd = 0,
  requests = 1,
  usdToSek = defaultPremiumPricing.exchange.usdToSek,
} = {}) {
  const inputCostUsd = (normalizeRate(inputTokens) * normalizeCount(requests) / 1000000) *
    normalizeRate(pricePerMillionInputTokensUsd)
  const outputCostUsd = (normalizeRate(outputTokens) * normalizeCount(requests) / 1000000) *
    normalizeRate(pricePerMillionOutputTokensUsd)

  return {
    inputCostSek: roundCurrency(inputCostUsd * usdToSek),
    outputCostSek: roundCurrency(outputCostUsd * usdToSek),
    totalCostSek: roundCurrency((inputCostUsd + outputCostUsd) * usdToSek),
  }
}

function buildAiCoachCost(counters, pricing = defaultPremiumPricing, usageMultiplier = 1) {
  const config = getAiPricing(pricing, 'aiCoach')
  const requests = normalizeCount(counters.aiCoachMessages * usageMultiplier)
  const tokenCost = calculateTokenCostSek({
    inputTokens: config.estimatedInputTokensPerRequest,
    outputTokens: config.estimatedOutputTokensPerRequest,
    pricePerMillionInputTokensUsd: config.pricePerMillionInputTokensUsd,
    pricePerMillionOutputTokensUsd: config.pricePerMillionOutputTokensUsd,
    requests,
    usdToSek: getUsdToSek(pricing),
  })

  return {
    ...tokenCost,
    costPerRequestSek: requests > 0 ? roundCurrency(tokenCost.totalCostSek / requests) : 0,
    inputTokensPerRequest: config.estimatedInputTokensPerRequest,
    label: 'AI Coach',
    outputTokensPerRequest: config.estimatedOutputTokensPerRequest,
    requests,
  }
}

function buildBodyScanCost(counters, pricing = defaultPremiumPricing, usageMultiplier = 1) {
  const config = getAiPricing(pricing, 'bodyScan')
  const scans = normalizeCount(counters.bodyScans * usageMultiplier)
  const tokenCost = calculateTokenCostSek({
    inputTokens: config.estimatedInputTokensPerScan,
    outputTokens: config.estimatedOutputTokensPerScan,
    pricePerMillionInputTokensUsd: config.pricePerMillionInputTokensUsd,
    pricePerMillionOutputTokensUsd: config.pricePerMillionOutputTokensUsd,
    requests: scans,
    usdToSek: getUsdToSek(pricing),
  })
  const imageCostSek = roundCurrency(
    scans * normalizeCount(config.imagesPerScan) *
    normalizeRate(config.estimatedImageInputCostUsd) *
    getUsdToSek(pricing),
  )
  const totalCostSek = roundCurrency(tokenCost.totalCostSek + imageCostSek)

  return {
    ...tokenCost,
    costPerRequestSek: scans > 0 ? roundCurrency(totalCostSek / scans) : 0,
    imageCostSek,
    imagesPerRequest: config.imagesPerScan,
    label: 'Body Scan',
    requests: scans,
    totalCostSek,
  }
}

function buildNutritionCost(counters, pricing = defaultPremiumPricing, usageMultiplier = 1) {
  const config = getAiPricing(pricing, 'nutritionPhoto')
  const analyses = normalizeCount(counters.nutritionAnalyses * usageMultiplier)
  const tokenCost = calculateTokenCostSek({
    inputTokens: config.estimatedInputTokensPerAnalysis,
    outputTokens: config.estimatedOutputTokensPerAnalysis,
    pricePerMillionInputTokensUsd: config.pricePerMillionInputTokensUsd,
    pricePerMillionOutputTokensUsd: config.pricePerMillionOutputTokensUsd,
    requests: analyses,
    usdToSek: getUsdToSek(pricing),
  })
  const imageCostSek = roundCurrency(
    analyses * normalizeCount(config.imagesPerAnalysis) *
    normalizeRate(config.estimatedImageInputCostUsd) *
    getUsdToSek(pricing),
  )
  const totalCostSek = roundCurrency(tokenCost.totalCostSek + imageCostSek)

  return {
    ...tokenCost,
    costPerRequestSek: analyses > 0 ? roundCurrency(totalCostSek / analyses) : 0,
    imageCostSek,
    imagesPerRequest: config.imagesPerAnalysis,
    label: 'Nutrition AI',
    requests: analyses,
    totalCostSek,
  }
}

function buildVoiceCost(counters, pricing = defaultPremiumPricing, usageMultiplier = 1) {
  const browserStt = getVoicePricing(pricing, 'browserSpeechRecognition')
  const browserTts = getVoicePricing(pricing, 'browserSpeechSynthesis')
  const externalTranscription = getVoicePricing(pricing, 'externalTranscription')
  const externalTts = getVoicePricing(pricing, 'externalTts')
  const realtimeVoice = getVoicePricing(pricing, 'realtimeVoice')
  const sessions = normalizeCount(counters.voiceSessions * usageMultiplier)
  const replies = normalizeCount(counters.aiVoiceReplies * usageMultiplier)
  const externalTranscriptionSek = externalTranscription.enabled
    ? roundCurrency(
      sessions *
      normalizeRate(externalTranscription.estimatedMinutesPerSession) *
      normalizeRate(externalTranscription.costPerMinuteUsd) *
      getUsdToSek(pricing),
    )
    : 0
  const externalTtsSek = externalTts.enabled
    ? roundCurrency(
      replies *
      normalizeRate(externalTts.estimatedCharactersPerReply) *
      normalizeRate(externalTts.costPerCharacterUsd) *
      getUsdToSek(pricing),
    )
    : 0
  const realtimeVoiceSek = realtimeVoice.enabled
    ? roundCurrency(
      sessions *
      (normalizeRate(realtimeVoice.estimatedInputAudioUnitsPerSession) *
        normalizeRate(realtimeVoice.inputAudioCostUsd) +
        normalizeRate(realtimeVoice.estimatedOutputAudioUnitsPerSession) *
        normalizeRate(realtimeVoice.outputAudioCostUsd)) *
      getUsdToSek(pricing),
    )
    : 0

  return {
    browserSpeechRecognitionSek: roundCurrency(normalizeRate(browserStt.costPerMinuteUsd) * 0),
    browserSpeechSynthesisSek: roundCurrency(normalizeRate(browserTts.costPerCharacterUsd) * 0),
    externalTranscriptionSek,
    externalTtsSek,
    label: 'Voice Conversation',
    realtimeVoiceSek,
    replies,
    requests: sessions,
    totalCostSek: roundCurrency(externalTranscriptionSek + externalTtsSek + realtimeVoiceSek),
  }
}

export function buildFeatureCostBreakdown({
  counters = {},
  pricing = defaultPremiumPricing,
  usageMultiplier = 1,
} = {}) {
  const normalizedCounters = normalizePremiumAnalyticsCounters(counters)
  const aiCoach = buildAiCoachCost(normalizedCounters, pricing, usageMultiplier)
  const bodyScan = buildBodyScanCost(normalizedCounters, pricing, usageMultiplier)
  const nutritionPhoto = buildNutritionCost(normalizedCounters, pricing, usageMultiplier)
  const voice = buildVoiceCost(normalizedCounters, pricing, usageMultiplier)

  return {
    aiCoach,
    bodyScan,
    localFeatures: [
      { label: 'Cloud Backup', note: 'Ingen AI-kostnad. Infrastruktur visas separat.', totalCostSek: 0 },
      { label: 'Global Search', note: 'Lokal sökning: 0 kr per användning.', totalCostSek: 0 },
      { label: 'Meal Planner', note: 'Lokal planering tills remote AI kopplas på.', totalCostSek: 0 },
    ],
    nutritionPhoto,
    voice,
  }
}

export function calculatePremiumAiCost(counters = {}, pricing = defaultPremiumPricing) {
  const breakdown = buildFeatureCostBreakdown({ counters, pricing })

  return roundCurrency(
    breakdown.aiCoach.totalCostSek +
    breakdown.bodyScan.totalCostSek +
    breakdown.nutritionPhoto.totalCostSek +
    breakdown.voice.totalCostSek,
  )
}

export function calculatePaymentFeeSek(priceSek, pricing = defaultPremiumPricing) {
  const payments = getPaymentsPricing(pricing)

  return roundCurrency(normalizeRate(priceSek) * normalizeRate(payments.percentageFee) + normalizeRate(payments.fixedFeeSek))
}

export function calculateInfrastructureMonthlySek(pricing = defaultPremiumPricing) {
  const infrastructure = getInfrastructurePricing(pricing)

  return roundCurrency(
    normalizeRate(infrastructure.supabaseMonthlySek) +
    normalizeRate(infrastructure.vercelMonthlySek) +
    normalizeRate(infrastructure.domainMonthlyEquivalentSek) +
    normalizeRate(infrastructure.otherFixedMonthlySek),
  )
}

function getUsageTotal(counters) {
  return normalizeCount(counters.aiCoachMessages) +
    normalizeCount(counters.bodyScans) +
    normalizeCount(counters.nutritionAnalyses)
}

function getCostTotal(featureCosts) {
  return roundCurrency(
    featureCosts.aiCoach.totalCostSek +
    featureCosts.bodyScan.totalCostSek +
    featureCosts.nutritionPhoto.totalCostSek,
  )
}

export function buildUsageRankings({
  counters = {},
  featureCosts,
} = {}) {
  const normalizedCounters = normalizePremiumAnalyticsCounters(counters)
  const costs = featureCosts || buildFeatureCostBreakdown({ counters: normalizedCounters })
  const usageTotal = getUsageTotal(normalizedCounters)
  const costTotal = getCostTotal(costs)
  const rows = [
    {
      costSek: costs.aiCoach.totalCostSek,
      key: 'aiCoach',
      label: 'AI Coach',
      usage: normalizedCounters.aiCoachMessages,
    },
    {
      costSek: costs.bodyScan.totalCostSek,
      key: 'bodyScan',
      label: 'Body Scan',
      usage: normalizedCounters.bodyScans,
    },
    {
      costSek: costs.nutritionPhoto.totalCostSek,
      key: 'nutritionPhoto',
      label: 'Nutrition AI',
      usage: normalizedCounters.nutritionAnalyses,
    },
  ].map((row) => ({
    ...row,
    costShare: costTotal > 0 ? roundRatio(row.costSek / costTotal) : 0,
    usageShare: usageTotal > 0 ? roundRatio(row.usage / usageTotal) : 0,
  }))

  const byUsage = [...rows].sort((first, second) => second.usage - first.usage)
  const byCost = [...rows].sort((first, second) => second.costSek - first.costSek)
  const byValue = [...rows].sort((first, second) => (
    (second.usageShare - second.costShare) - (first.usageShare - first.costShare)
  ))

  return {
    byCost,
    byUsage,
    bestValue: byValue[0] || null,
    rows,
  }
}

export function compareActualVsEstimated({
  estimatedOpenAiSek = 0,
  pricing = defaultPremiumPricing,
} = {}) {
  const actual = pricing.actualMonthlySpendSek || {}
  const actualOpenAiSek = Number.isFinite(Number(actual.openAi)) ? Number(actual.openAi) : null

  return {
    actualOpenAiSek,
    differenceSek: actualOpenAiSek === null ? null : roundCurrency(actualOpenAiSek - estimatedOpenAiSek),
    estimatedOpenAiSek: roundCurrency(estimatedOpenAiSek),
  }
}

function getRiskStatus(costPerPremiumUserSek, netRevenuePerPremiumUserSek) {
  if (netRevenuePerPremiumUserSek <= 0) return 'critical'

  const ratio = costPerPremiumUserSek / netRevenuePerPremiumUserSek
  if (ratio > 1) return 'critical'
  if (ratio > 0.8) return 'red'
  if (ratio >= 0.5) return 'yellow'
  return 'green'
}

function getStatusFromMargin(grossMarginRatio) {
  if (grossMarginRatio < 0) return 'critical'
  if (grossMarginRatio < 0.2) return 'red'
  if (grossMarginRatio < 0.5) return 'yellow'
  return 'green'
}

export function calculateScenarioEconomics({
  activeUsers = defaultPremiumPricing.simulatorDefaults.activeUsers,
  averageUsageMultiplier = defaultPremiumPricing.simulatorDefaults.averageUsageMultiplier,
  counters = {},
  premiumConversionRate = defaultPremiumPricing.simulatorDefaults.premiumConversionRate,
  premiumPriceSek = getPremiumPriceSek(defaultPremiumPricing),
  pricing = defaultPremiumPricing,
} = {}) {
  const premiumUsers = Math.max(0, Math.round(normalizeCount(activeUsers) * normalizeRate(premiumConversionRate)))
  const revenueSek = roundCurrency(premiumUsers * normalizeRate(premiumPriceSek))
  const paymentFeePerPremiumUserSek = calculatePaymentFeeSek(premiumPriceSek, pricing)
  const paymentFeesSek = roundCurrency(paymentFeePerPremiumUserSek * premiumUsers)
  const netRevenueSek = roundCurrency(revenueSek - paymentFeesSek)
  const featureCostsPerUser = buildFeatureCostBreakdown({ counters, pricing, usageMultiplier: averageUsageMultiplier })
  const aiCostPerPremiumUserSek = calculatePremiumAiCost(
    normalizePremiumAnalyticsCounters(counters),
    pricing,
  ) * normalizeRate(averageUsageMultiplier || 1)
  const aiCostsSek = roundCurrency(aiCostPerPremiumUserSek * premiumUsers)
  const infrastructureSek = calculateInfrastructureMonthlySek(pricing)
  const totalCostSek = roundCurrency(paymentFeesSek + aiCostsSek + infrastructureSek)
  const grossProfitSek = roundCurrency(revenueSek - totalCostSek)
  const costPerPremiumUserSek = premiumUsers > 0 ? roundCurrency((aiCostsSek + infrastructureSek) / premiumUsers) : 0
  const totalCostPerPremiumUserSek = premiumUsers > 0 ? roundCurrency(totalCostSek / premiumUsers) : 0
  const netRevenuePerPremiumUserSek = premiumUsers > 0 ? roundCurrency(netRevenueSek / premiumUsers) : 0

  return {
    activeUsers: normalizeCount(activeUsers),
    aiCostPerPremiumUserSek: roundCurrency(aiCostPerPremiumUserSek),
    aiCostsSek,
    arpuSek: normalizeCount(activeUsers) > 0 ? roundCurrency(revenueSek / normalizeCount(activeUsers)) : 0,
    averageUsageMultiplier: normalizeRate(averageUsageMultiplier || 1),
    costPerActiveUserSek: normalizeCount(activeUsers) > 0 ? roundCurrency(totalCostSek / normalizeCount(activeUsers)) : 0,
    costPerPremiumUserSek,
    featureCostsPerUser,
    grossMarginRatio: revenueSek > 0 ? roundRatio(grossProfitSek / revenueSek) : 0,
    grossProfitSek,
    infrastructurePerActiveUserSek: normalizeCount(activeUsers) > 0 ? roundCurrency(infrastructureSek / normalizeCount(activeUsers)) : 0,
    infrastructurePerPremiumUserSek: premiumUsers > 0 ? roundCurrency(infrastructureSek / premiumUsers) : 0,
    infrastructureSek,
    netRevenuePerPremiumUserSek,
    netRevenueSek,
    paymentFeePerPremiumUserSek,
    paymentFeesSek,
    premiumConversionRate: normalizeRate(premiumConversionRate),
    premiumPriceSek: normalizeRate(premiumPriceSek),
    premiumUsers,
    revenueSek,
    riskStatus: getRiskStatus(costPerPremiumUserSek, netRevenuePerPremiumUserSek),
    status: getStatusFromMargin(revenueSek > 0 ? grossProfitSek / revenueSek : 0),
    totalCostPerPremiumUserSek,
    totalCostSek,
  }
}

export function calculateRequiredPremiumPrice({
  activeUsers = defaultPremiumPricing.simulatorDefaults.activeUsers,
  counters = {},
  desiredMargin = 0,
  premiumConversionRate = defaultPremiumPricing.simulatorDefaults.premiumConversionRate,
  pricing = defaultPremiumPricing,
  usageMultiplier = defaultPremiumPricing.simulatorDefaults.averageUsageMultiplier,
} = {}) {
  const premiumUsers = Math.max(1, Math.round(normalizeCount(activeUsers) * normalizeRate(premiumConversionRate)))
  const aiCostPerPremiumUserSek = calculatePremiumAiCost(counters, pricing) * normalizeRate(usageMultiplier || 1)
  const infrastructurePerPremiumUserSek = calculateInfrastructureMonthlySek(pricing) / premiumUsers
  const payments = getPaymentsPricing(pricing)
  const fixedFeeSek = normalizeRate(payments.fixedFeeSek)
  const percentageFee = normalizeRate(payments.percentageFee)
  const numerator = aiCostPerPremiumUserSek + infrastructurePerPremiumUserSek + fixedFeeSek
  const denominator = 1 - percentageFee - normalizeRate(desiredMargin)

  return denominator > 0 ? roundCurrency(numerator / denominator) : Infinity
}

export function buildBreakEvenAnalysis({
  activeUsers = defaultPremiumPricing.simulatorDefaults.activeUsers,
  counters = {},
  premiumConversionRate = defaultPremiumPricing.simulatorDefaults.premiumConversionRate,
  premiumPriceSek = getPremiumPriceSek(defaultPremiumPricing),
  pricing = defaultPremiumPricing,
  usageMultiplier = defaultPremiumPricing.simulatorDefaults.averageUsageMultiplier,
} = {}) {
  const aiCostPerPremiumUserSek = calculatePremiumAiCost(counters, pricing) * normalizeRate(usageMultiplier || 1)
  const paymentFeePerPremiumUserSek = calculatePaymentFeeSek(premiumPriceSek, pricing)
  const contributionPerPremiumUserSek = normalizeRate(premiumPriceSek) - paymentFeePerPremiumUserSek - aiCostPerPremiumUserSek
  const infrastructureSek = calculateInfrastructureMonthlySek(pricing)
  const requiredPremiumUsers = contributionPerPremiumUserSek > 0
    ? Math.ceil(infrastructureSek / contributionPerPremiumUserSek)
    : Infinity

  return {
    breakEvenPriceSek: calculateRequiredPremiumPrice({
      activeUsers,
      counters,
      desiredMargin: 0,
      premiumConversionRate,
      pricing,
      usageMultiplier,
    }),
    priceFor20MarginSek: calculateRequiredPremiumPrice({
      activeUsers,
      counters,
      desiredMargin: 0.2,
      premiumConversionRate,
      pricing,
      usageMultiplier,
    }),
    priceFor40MarginSek: calculateRequiredPremiumPrice({
      activeUsers,
      counters,
      desiredMargin: 0.4,
      premiumConversionRate,
      pricing,
      usageMultiplier,
    }),
    priceFor60MarginSek: calculateRequiredPremiumPrice({
      activeUsers,
      counters,
      desiredMargin: 0.6,
      premiumConversionRate,
      pricing,
      usageMultiplier,
    }),
    requiredPremiumUsers,
  }
}

export function buildSensitivityAnalysis({
  activeUsers,
  counters = {},
  premiumConversionRate,
  pricing = defaultPremiumPricing,
  usageMultiplier,
} = {}) {
  return defaultPremiumPricing.sensitivityPricesSek.map((premiumPriceSek) => {
    const scenario = calculateScenarioEconomics({
      activeUsers,
      averageUsageMultiplier: usageMultiplier,
      counters,
      premiumConversionRate,
      premiumPriceSek,
      pricing,
    })

    return {
      costPerPremiumUserSek: scenario.totalCostPerPremiumUserSek,
      marginRatio: scenario.grossMarginRatio,
      netRevenuePerPremiumUserSek: scenario.netRevenuePerPremiumUserSek,
      premiumPriceSek,
      profitPerPremiumUserSek: scenario.premiumUsers > 0
        ? roundCurrency(scenario.grossProfitSek / scenario.premiumUsers)
        : 0,
    }
  })
}

export function buildPremiumAnalyticsSummary({
  counters = {},
  pricing = defaultPremiumPricing,
  scenario,
} = {}) {
  const normalizedCounters = normalizePremiumAnalyticsCounters(counters)
  const monthlyPriceSek = getPremiumPriceSek(pricing)
  const featureCosts = buildFeatureCostBreakdown({ counters: normalizedCounters, pricing })
  const aiCostSek = calculatePremiumAiCost(normalizedCounters, pricing)
  const paymentFeeSek = calculatePaymentFeeSek(monthlyPriceSek, pricing)
  const netRevenueSek = roundCurrency(monthlyPriceSek - paymentFeeSek)
  const infrastructureSek = calculateInfrastructureMonthlySek(pricing)
  const grossMarginSek = roundCurrency(netRevenueSek - aiCostSek)
  const marginRatio = netRevenueSek > 0 ? grossMarginSek / netRevenueSek : 0
  const scenarioInput = scenario || {
    ...defaultPremiumPricing.simulatorDefaults,
    premiumPriceSek: monthlyPriceSek,
  }
  const scenarioEconomics = calculateScenarioEconomics({
    counters: normalizedCounters,
    premiumPriceSek: scenarioInput.premiumPriceSek ?? monthlyPriceSek,
    pricing,
    ...scenarioInput,
  })

  return {
    actualVsEstimated: compareActualVsEstimated({ estimatedOpenAiSek: aiCostSek, pricing }),
    aiCostSek,
    breakEven: buildBreakEvenAnalysis({
      counters: normalizedCounters,
      premiumPriceSek: scenarioInput.premiumPriceSek ?? monthlyPriceSek,
      pricing,
      ...scenarioInput,
    }),
    counters: normalizedCounters,
    featureCosts,
    grossMarginSek,
    infrastructureSek,
    isProfitable: grossMarginSek >= 0,
    monthlyPriceSek,
    netRevenueSek,
    paymentFeeSek,
    rankings: buildUsageRankings({ counters: normalizedCounters, featureCosts }),
    riskStatus: getRiskStatus(aiCostSek, netRevenueSek),
    scenario: scenarioEconomics,
    sensitivity: buildSensitivityAnalysis({
      activeUsers: scenarioInput.activeUsers,
      counters: normalizedCounters,
      premiumConversionRate: scenarioInput.premiumConversionRate,
      pricing,
      usageMultiplier: scenarioInput.averageUsageMultiplier,
    }),
    status: getStatusFromMargin(marginRatio),
  }
}

export function readPremiumAnalyticsSummary(userId, {
  pricing = defaultPremiumPricing,
  scenario,
  storage,
} = {}) {
  return buildPremiumAnalyticsSummary({
    counters: getPremiumAnalyticsCounters(userId, storage),
    pricing,
    scenario,
  })
}
