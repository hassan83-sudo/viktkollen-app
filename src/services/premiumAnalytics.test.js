import { describe, expect, it } from 'vitest'
import { defaultPremiumPricing } from './premiumPricing.js'
import {
  buildBreakEvenAnalysis,
  buildFeatureCostBreakdown,
  buildPremiumAnalyticsSummary,
  buildUsageRankings,
  calculatePaymentFeeSek,
  calculatePremiumAiCost,
  calculateRequiredPremiumPrice,
  calculateScenarioEconomics,
  calculateTokenCostSek,
  compareActualVsEstimated,
  incrementPremiumAnalyticsCounter,
  premiumAnalyticsCounters,
  premiumAnalyticsStorageKey,
  readPremiumAnalyticsSummary,
} from './premiumAnalytics.js'

function createMemoryStorage() {
  const values = new Map()

  return {
    read: (key, fallbackValue) => values.has(key) ? values.get(key) : fallbackValue,
    write: (key, value) => values.set(key, value),
  }
}

describe('premiumAnalytics', () => {
  it('increments counters per user without storing personal content', () => {
    const storage = createMemoryStorage()

    incrementPremiumAnalyticsCounter(premiumAnalyticsCounters.aiCoachMessages, {
      storage,
      userId: 'user-a',
    })
    incrementPremiumAnalyticsCounter(premiumAnalyticsCounters.bodyScans, {
      amount: 2,
      storage,
      userId: 'user-a',
    })

    const stored = storage.read(premiumAnalyticsStorageKey, null)

    expect(stored.users['user-a']).toMatchObject({
      aiCoachMessages: 1,
      bodyScans: 2,
    })
    expect(JSON.stringify(stored)).not.toMatch(/hej|prompt|image|base64|recording/i)
  })

  it('calculates AI Coach token cost from requests and model prices', () => {
    const cost = calculateTokenCostSek({
      inputTokens: 1500,
      outputTokens: 300,
      pricePerMillionInputTokensUsd: 0.15,
      pricePerMillionOutputTokensUsd: 0.6,
      requests: 100,
      usdToSek: 10,
    })

    expect(cost.inputCostSek).toBeCloseTo(0.22)
    expect(cost.outputCostSek).toBeCloseTo(0.18)
    expect(cost.totalCostSek).toBeCloseTo(0.4)
  })

  it('calculates Body Scan and Nutrition image costs separately from token costs', () => {
    const breakdown = buildFeatureCostBreakdown({
      counters: {
        bodyScans: 2,
        nutritionAnalyses: 3,
      },
      pricing: {
        ...defaultPremiumPricing,
        exchange: { usdToSek: 10 },
      },
    })

    expect(breakdown.bodyScan.imageCostSek).toBeCloseTo(0.18)
    expect(breakdown.bodyScan.totalCostSek).toBeGreaterThan(breakdown.bodyScan.imageCostSek)
    expect(breakdown.nutritionPhoto.imageCostSek).toBeCloseTo(0.09)
  })

  it('keeps browser speech recognition and synthesis at zero external audio cost', () => {
    const breakdown = buildFeatureCostBreakdown({
      counters: {
        aiCoachMessages: 4,
        aiVoiceReplies: 4,
        voiceSessions: 2,
      },
    })

    expect(breakdown.voice.browserSpeechRecognitionSek).toBe(0)
    expect(breakdown.voice.browserSpeechSynthesisSek).toBe(0)
    expect(breakdown.voice.totalCostSek).toBe(0)
    expect(calculatePremiumAiCost({
      aiCoachMessages: 4,
      aiVoiceReplies: 4,
      voiceSessions: 2,
    })).toBeCloseTo(breakdown.aiCoach.totalCostSek)
  })

  it('can represent external voice costs when explicitly enabled', () => {
    const breakdown = buildFeatureCostBreakdown({
      counters: {
        aiVoiceReplies: 10,
        voiceSessions: 5,
      },
      pricing: {
        ...defaultPremiumPricing,
        voice: {
          ...defaultPremiumPricing.voice,
          externalTranscription: {
            costPerMinuteUsd: 0.01,
            enabled: true,
            estimatedMinutesPerSession: 2,
          },
          externalTts: {
            costPerCharacterUsd: 0.00001,
            enabled: true,
            estimatedCharactersPerReply: 1000,
          },
        },
      },
    })

    expect(breakdown.voice.externalTranscriptionSek).toBeGreaterThan(0)
    expect(breakdown.voice.externalTtsSek).toBeGreaterThan(0)
    expect(breakdown.voice.totalCostSek).toBeGreaterThan(0)
  })

  it('calculates payment fees and scenario profitability', () => {
    const fee = calculatePaymentFeeSek(9, {
      ...defaultPremiumPricing,
      payments: {
        fixedFeeSek: 1,
        percentageFee: 0.03,
      },
    })
    const scenario = calculateScenarioEconomics({
      activeUsers: 100,
      counters: { aiCoachMessages: 10 },
      premiumConversionRate: 0.15,
      premiumPriceSek: 9,
    })

    expect(fee).toBeCloseTo(1.27)
    expect(scenario.premiumUsers).toBe(15)
    expect(scenario.paymentFeesSek).toBeGreaterThan(0)
    expect(scenario.arpuSek).toBeGreaterThan(0)
  })

  it('distributes fixed costs per active and Premium user', () => {
    const scenario = calculateScenarioEconomics({
      activeUsers: 100,
      counters: {},
      premiumConversionRate: 0.1,
      premiumPriceSek: 9,
      pricing: {
        ...defaultPremiumPricing,
        infrastructure: {
          domainMonthlyEquivalentSek: 10,
          otherFixedMonthlySek: 0,
          supabaseMonthlySek: 20,
          vercelMonthlySek: 70,
        },
      },
    })

    expect(scenario.infrastructureSek).toBe(100)
    expect(scenario.infrastructurePerActiveUserSek).toBe(1)
    expect(scenario.infrastructurePerPremiumUserSek).toBe(10)
  })

  it('calculates break-even and required prices for target margins', () => {
    const analysis = buildBreakEvenAnalysis({
      activeUsers: 100,
      counters: { aiCoachMessages: 10 },
      premiumConversionRate: 0.1,
      premiumPriceSek: 9,
    })

    expect(analysis.requiredPremiumUsers).toBeGreaterThan(0)
    expect(analysis.priceFor20MarginSek).toBeGreaterThan(analysis.breakEvenPriceSek)
    expect(analysis.priceFor40MarginSek).toBeGreaterThan(analysis.priceFor20MarginSek)
    expect(analysis.priceFor60MarginSek).toBeGreaterThan(analysis.priceFor40MarginSek)
    expect(calculateRequiredPremiumPrice({ desiredMargin: 0.4 })).toBeGreaterThan(0)
  })

  it('builds usage and cost rankings with percentages', () => {
    const counters = {
      aiCoachMessages: 100,
      bodyScans: 10,
      nutritionAnalyses: 5,
    }
    const featureCosts = buildFeatureCostBreakdown({ counters })
    const rankings = buildUsageRankings({ counters, featureCosts })

    expect(rankings.byUsage[0].label).toBe('AI Coach')
    expect(rankings.byCost[0].costSek).toBeGreaterThanOrEqual(rankings.byCost[1].costSek)
    expect(rankings.rows.reduce((sum, row) => sum + row.usageShare, 0)).toBeCloseTo(1, 1)
  })

  it('handles zero usage without NaN percentages', () => {
    const summary = buildPremiumAnalyticsSummary({ counters: {} })

    expect(summary.aiCostSek).toBe(0)
    expect(summary.rankings.rows.every((row) => row.usageShare === 0 && row.costShare === 0)).toBe(true)
  })

  it('compares actual and estimated costs for later calibration', () => {
    const comparison = compareActualVsEstimated({
      estimatedOpenAiSek: 12,
      pricing: {
        ...defaultPremiumPricing,
        actualMonthlySpendSek: {
          openAi: 15,
        },
      },
    })

    expect(comparison.actualOpenAiSek).toBe(15)
    expect(comparison.differenceSek).toBe(3)
  })

  it('reads a current user summary from local storage', () => {
    const storage = createMemoryStorage()

    incrementPremiumAnalyticsCounter(premiumAnalyticsCounters.nutritionAnalyses, {
      amount: 3,
      storage,
      userId: 'user-b',
    })

    expect(readPremiumAnalyticsSummary('user-b', { storage }).counters.nutritionAnalyses).toBe(3)
    expect(readPremiumAnalyticsSummary('user-a', { storage }).counters.nutritionAnalyses).toBe(0)
  })
})
