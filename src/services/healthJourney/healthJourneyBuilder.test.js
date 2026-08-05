import { describe, expect, it } from 'vitest'
import {
  buildHealthJourney,
  buildMinimalHealthJourneyAiPayload,
  aggregateHealthJourneyEvents,
  healthJourneyBuilderInternals,
} from './healthJourneyBuilder.js'
import {
  containsSensitiveHealthJourneyText,
  createHealthJourneyEvent,
  validateHealthJourneyEvent,
} from './healthJourneyModel.js'
import { buildHealthJourneySummary } from './healthJourneySummary.js'

const fixture = {
  adaptiveCoachFeedback: {
    recommendations: [
      {
        action: 'Ta ett kort steg',
        area: 'activity',
        completedAt: '2026-07-30T08:00:00.000Z',
        createdAt: '2026-07-29T08:00:00.000Z',
        id: 'rec-1',
        recommendationId: 'rec-1',
        status: 'completed',
        title: 'Kort promenad',
        updatedAt: '2026-07-30T08:00:00.000Z',
      },
      {
        action: 'Planera lunch',
        area: 'nutrition',
        id: 'rec-2',
        recommendationId: 'rec-2',
        status: 'accepted',
        title: 'Lunchplan',
        updatedAt: '2026-07-29T08:00:00.000Z',
      },
    ],
    timeline: [
      {
        eventType: 'recommendationCompleted',
        occurredAt: '2026-07-30T08:00:00.000Z',
        recommendationId: 'rec-1',
        source: 'test',
        summary: 'Kort promenad markerades klar.',
        title: 'Kort promenad',
      },
    ],
  },
  checkIns: [
    { date: '2026-07-28T21:30:00', energy: 6, mood: 'Fokuserad', steps: 7200, workout: true },
    { date: '2026-07-29T21:30:00', energy: 7, mood: 'Bra', steps: 7600, workout: 'promenad' },
    { date: '2026-07-30T21:30:00', energy: 7, mood: 'Bra', steps: 8200, workout: { completed: true, type: 'gym' } },
  ],
  goalsHabits: {
    achievements: {
      events: [{ type: 'achievementUnlocked', definitionId: 'first-meal', at: '2026-07-28T12:00:00.000Z' }],
      unlocked: ['first-meal', 'first-check-in'],
    },
    goals: [{ id: 'goal-1', status: 'completed', title: 'Logga veckan' }],
    habits: [{ completedDates: ['2026-07-28', '2026-07-29', '2026-07-30'], id: 'habit-1', status: 'active', title: 'Check-in' }],
    weeklyFocus: [{ id: 'focus-1', status: 'completed', title: 'Protein' }],
  },
  meals: [
    { calories: 360, date: '2026-07-28T12:00:00', fiber: 5, id: 'meal-1', name: 'Kyckling och ris', protein: 35, type: 'Lunch' },
    { calories: 420, date: '2026-07-29T12:00:00', fiber: 7, id: 'meal-2', name: 'Lax potatis broccoli', protein: 32, type: 'Middag' },
    { calories: 390, date: '2026-07-30T08:00:00', fiber: 6, id: 'meal-3', name: 'Ägg och havregryn', protein: 28, type: 'Frukost' },
    { calories: 500, date: '2026-07-30T18:00:00', fiber: 8, id: 'meal-4', name: 'Kyckling sallad potatis', protein: 42, type: 'Middag' },
    { calories: 450, date: '2026-07-30T18:00:00', id: 'planned-1', isPlanned: true, name: 'Planerad middag', protein: 20, status: 'planned' },
  ],
  nutritionGoals: { calories: 2200, fiber: 25, protein: 120 },
  profile: { goal: 'gå ner i vikt', goalWeight: 78 },
  reminderState: {
    history: [
      { action: 'completed', at: '2026-07-29T09:00:00.000Z' },
      { action: 'completed', at: '2026-07-30T09:00:00.000Z' },
    ],
  },
  weights: [
    { date: '2026-07-01T07:00:00', id: 'w1', value: 91.8 },
    { date: '2026-07-20T07:00:00', id: 'w2', value: 90.3 },
    { date: '2026-07-30T19:25:00', id: 'w3', value: 89.6 },
  ],
}

describe('healthJourneyModel', () => {
  it('normalizes safe read-only events with stable masked ids', () => {
    const event = createHealthJourneyEvent({
      category: 'weight',
      occurredAt: '2026-07-30T12:00:00.000Z',
      relatedEntityId: 'raw-user-facing-id',
      source: 'test',
      summary: 'Total förändring är 2,2 kg ned.',
      title: 'Viktresa',
      tone: 'positive',
      type: 'weightProgress',
    })

    expect(event.derived).toBe(true)
    expect(event.relatedEntityIdMasked).toMatch(/^masked-/)
    expect(event).not.toHaveProperty('relatedEntityId')
    expect(validateHealthJourneyEvent(event)).toEqual([])
  })

  it('blocks sensitive text patterns from user-visible fields', () => {
    const event = createHealthJourneyEvent({
      source: 'providerresponse',
      summary: 'token abc',
      title: 'user@example.com',
      type: 'weightProgress',
    })

    expect(event.title).toBe('Journey-händelse')
    expect(event.summary).toBe('Sammanfattning saknas.')
    expect(containsSensitiveHealthJourneyText(JSON.stringify(event))).toBe(false)
  })
})

describe('buildHealthJourney', () => {
  it('is deterministic for the same input', () => {
    const first = buildHealthJourney(fixture, { analysisDate: '2026-07-30', period: '90d' })
    const second = buildHealthJourney(fixture, { analysisDate: '2026-07-30', period: '90d' })

    expect(second.events.map((event) => event.id)).toEqual(first.events.map((event) => event.id))
    expect(second.summary).toBeUndefined()
  })

  it('builds deduplicated, sorted, user-visible journey events', () => {
    const journey = buildHealthJourney(fixture, { analysisDate: '2026-07-30', period: '90d' })

    expect(journey.events.length).toBeGreaterThan(5)
    expect(journey.events.length).toBeLessThanOrEqual(36)
    expect(journey.events.every((event) => event.userVisible && event.derived)).toBe(true)
    expect(journey.events.map((event) => event.occurredAt)).toEqual([...journey.events.map((event) => event.occurredAt)].sort().reverse())
    expect(new Set(journey.events.map((event) => event.id)).size).toBe(journey.events.length)
  })

  it('separates predictions from factual events', () => {
    const journey = buildHealthJourney(fixture, { analysisDate: '2026-07-30', period: '90d' })
    const prediction = journey.events.find((event) => event.type === 'predictionChanged')

    expect(prediction).toBeTruthy()
    expect(prediction.summary).toMatch(/Prognos:/)
    expect(prediction.source).toBe('prediction.engine')
  })

  it('does not count accepted coach actions as success', () => {
    const journey = buildHealthJourney(fixture, { analysisDate: '2026-07-30', period: '90d' })
    const completed = journey.events.filter((event) => event.type === 'coachActionCompleted')

    expect(completed.some((event) => event.summary.includes('2'))).toBe(false)
    expect(completed.some((event) => event.summary.includes('1'))).toBe(true)
  })

  it('keeps planned meals out of actual journey nutrition counts', () => {
    const journey = buildHealthJourney(fixture, { analysisDate: '2026-07-30', period: '90d' })
    const mealEvent = journey.events.find((event) => event.type === 'mealQuality')

    expect(mealEvent.summary).not.toContain('planerad')
    expect(journey.limitations).not.toContain('Saknad måltidsdata idag tolkas inte som dåliga vanor.')
  })

  it('returns safe limitations when data is missing', () => {
    const journey = buildHealthJourney({}, { analysisDate: '2026-07-30', period: '90d' })

    expect(journey.limitations.length).toBeGreaterThan(0)
    expect(JSON.stringify(journey)).not.toMatch(/undefined|null object|\[object Object\]/i)
  })

  it('aggregates by day week month and theme', () => {
    const journey = buildHealthJourney(fixture, { analysisDate: '2026-07-30', period: '90d' })
    const aggregation = aggregateHealthJourneyEvents(journey.events)

    expect(aggregation.byDay.length).toBeGreaterThan(0)
    expect(aggregation.byWeek.length).toBeGreaterThan(0)
    expect(aggregation.byMonth.length).toBeGreaterThan(0)
    expect(aggregation.byTheme.some((group) => group.key === 'nutrition')).toBe(true)
  })

  it('limits duplicate low-value events per day', () => {
    const base = createHealthJourneyEvent({
      category: 'nutrition',
      occurredAt: '2026-07-30T12:00:00.000Z',
      source: 'test',
      summary: 'Samma sak',
      title: 'Dublett',
      type: 'nutritionGap',
    })
    const events = healthJourneyBuilderInternals.limitEvents(Array.from({ length: 10 }, (_, index) => ({
      ...base,
      id: `duplicate-${index}`,
      source: `test-${index}`,
      title: `Dublett ${index}`,
      summary: `Samma sak ${index}`,
    })))

    expect(events.length).toBe(5)
  })
})

describe('healthJourneySummary and AI payload', () => {
  it('creates neutral Swedish journey summary', () => {
    const journey = buildHealthJourney(fixture, { analysisDate: '2026-07-30', period: '90d' })
    const summary = buildHealthJourneySummary(journey)

    expect(summary.currentPhase).toBeTruthy()
    expect(summary.mainCurrentFocus).toBeTruthy()
    expect(summary.text).not.toMatch(/diagnos|garanterar|du är/i)
  })

  it('requires consent for remote AI payload', () => {
    const journey = buildHealthJourney(fixture, { analysisDate: '2026-07-30', period: '90d' })

    expect(buildMinimalHealthJourneyAiPayload(journey, { consent: false }).allowed).toBe(false)
  })

  it('minimizes remote AI payload when consent exists', () => {
    const journey = buildHealthJourney(fixture, { analysisDate: '2026-07-30', period: '90d' })
    const payload = buildMinimalHealthJourneyAiPayload(journey, {
      consent: true,
      question: 'Kan du förklara min resa?',
    })

    expect(payload.allowed).toBe(true)
    expect(payload).not.toHaveProperty('events')
    expect(JSON.stringify(payload)).not.toMatch(/raw|token|session|providerresponse|rec-1|meal-1|w1/i)
    expect(JSON.stringify(payload).length).toBeLessThan(1600)
  })
})
