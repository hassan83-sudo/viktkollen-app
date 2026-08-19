import { describe, expect, it } from 'vitest'
import {
  coachRecommendationSchemaVersion,
  createAiCoachV2Report,
  normalizeCoachRecommendations,
  updateCoachRecommendationFeedback,
} from './aiCoachV2Service.js'

const today = '2026-07-31'
const bodyAnalysisHistory = [
  {
    createdAt: '2026-07-30T08:00:00.000Z',
    result: {
      estimatedWeight: {
        basis: 'tre bildvinklar',
        confidence: 'low',
        maxKg: 91,
        midpointKg: 89.5,
        minKg: 88,
      },
      summary: 'Stabil hållning och jämförbart underlag.',
    },
  },
]

const data = {
  bodyAnalysisHistory,
  checkIn: { date: today, energy: 3, mood: 'Trött', steps: 2500, workout: false },
  checkIns: [{ date: today, energy: 3, mood: 'Trött', steps: 2500, workout: false }],
  meals: [
    { calories: 420, date: today, id: 'meal-1', name: 'Ris och grönsaker', protein: 18, type: 'Lunch' },
    { calories: 500, date: '2026-07-29', id: 'meal-2', name: 'Tofu bowl', protein: 35, type: 'Middag' },
    { calories: 380, date: '2026-07-26', id: 'meal-3', name: 'Yoghurt', protein: 25, type: 'Frukost' },
  ],
  nutritionGoals: { calories: 2100, protein: 120 },
  profile: { activityLevel: 'medium', age: 35, goalWeight: 82, height: 178, name: 'Alex', startWeight: 92 },
  today,
  weights: [
    { date: '2026-07-22', value: 91.5 },
    { date: '2026-07-24', value: 91.1 },
    { date: '2026-07-26', value: 90.8 },
    { date: '2026-07-28', value: 90.2 },
    { date: '2026-07-30', value: 89.9 },
    { date: today, value: 89.6 },
  ],
}

describe('AI Coach V2 service', () => {
  it('builds structured daily advice with evidence, priority, confidence and context quality', () => {
    const report = createAiCoachV2Report(data)

    expect(report.schemaVersion).toBe(coachRecommendationSchemaVersion)
    expect(report.contextQuality.level).toBe('high')
    expect(report.dailyAdvice).toMatchObject({
      category: expect.any(String),
      confidence: expect.stringMatching(/low|medium|high/),
      priority: expect.stringMatching(/low|medium|high/),
      schemaVersion: coachRecommendationSchemaVersion,
    })
    expect(report.recommendations.length).toBeGreaterThan(0)
    expect(report.recommendations[0].evidence.length).toBeGreaterThan(0)
    expect(report.nextBestAction).toBe(report.dailyAdvice.action)
  })

  it('keeps measured weight separate from body scan AI estimates', () => {
    const report = createAiCoachV2Report(data)

    expect(report.context.weight.latestMeasuredWeight).toBe(89.6)
    expect(report.context.provenance.weight).toBe('measured')
    expect(report.context.bodyScan.estimatedWeight).toMatchObject({
      maxKg: 91,
      minKg: 88,
      provenance: 'ai_estimated',
    })
    expect(report.weeklyReportV2.bodyScan.weightEstimate).toMatchObject({
      maxKg: 91,
      minKg: 88,
    })
    expect(report.weeklyReportV2.weight.latestMeasured).toBe(89.6)
  })

  it('reduces repeated advice from recent reports', () => {
    const firstReport = createAiCoachV2Report(data)
    const secondReport = createAiCoachV2Report({
      ...data,
      previousReports: [firstReport],
    })

    expect(secondReport.dailyAdvice?.id).not.toBe(firstReport.dailyAdvice?.id)
  })

  it('normalizes unsafe and malformed recommendations defensively', () => {
    const recommendations = normalizeCoachRecommendations([
      {
        action: 'Fortsätt med en vanlig måltid och kort promenad.',
        category: 'activity',
        confidence: 'medium',
        evidence: ['Stegen är låga idag.'],
        priority: 'high',
        title: 'Litet nästa steg',
      },
      {
        action: 'Crash-dieta för garanterat resultat.',
        category: 'weight',
        priority: 'high',
        title: 'Extremt råd',
      },
    ], { now: '2026-07-31T12:00:00.000Z' })

    expect(recommendations).toHaveLength(1)
    expect(recommendations[0]).toMatchObject({
      category: 'activity',
      createdAt: '2026-07-31T12:00:00.000Z',
      priority: 'high',
      schemaVersion: coachRecommendationSchemaVersion,
      title: 'Litet nästa steg',
    })
    expect(JSON.stringify(recommendations)).not.toMatch(/crash|garanterat/i)
  })

  it('stores recommendation feedback without changing the rest of the report', () => {
    const report = createAiCoachV2Report(data)
    const updated = updateCoachRecommendationFeedback(
      report,
      report.recommendations[0].id,
      'not_relevant',
      { now: '2026-07-31T13:00:00.000Z' },
    )

    expect(updated.id).toBe(report.id)
    expect(updated.recommendations[0]).toMatchObject({
      feedback: { at: '2026-07-31T13:00:00.000Z', value: 'not_relevant' },
      status: 'dismissed',
    })
  })

  it('uses low quality coaching when user data is thin instead of inventing facts', () => {
    const report = createAiCoachV2Report({ today })

    expect(report.contextQuality.level).toBe('low')
    expect(report.recommendations.some((recommendation) => recommendation.category === 'logging')).toBe(true)
    expect(report.weeklyReportV2.strengths[0]).toContain('Inga tydliga styrkor')
    expect(JSON.stringify(report)).not.toMatch(/NaN|Infinity|undefined|\[object Object\]/)
  })
})
