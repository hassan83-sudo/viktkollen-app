import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import AdaptiveCoachTimeline from '../components/AdaptiveCoachTimeline.jsx'
import {
  appendAdaptiveCoachTimelineEvent,
  buildAdaptiveCoachTimeline,
  buildAdaptiveCoachTimelineSummary,
  explainCoachAdaptation,
  resolveCoachActionOutcome,
} from './adaptiveCoachTimeline.js'
import { normalizeAdaptiveCoachFeedback } from './adaptiveCoachFeedback.js'

const analysisDate = '2026-07-31'
const now = `${analysisDate}T12:00:00.000Z`

const feedback = {
  recommendations: [
    {
      action: 'Lägg till protein i nästa måltid.',
      actionCreatedAt: '2026-07-29T12:00:00.000Z',
      area: 'nutrition',
      id: 'coach-protein',
      lastActionStatus: 'active',
      linkedEntityId: 'habit-1',
      linkedEntityType: 'habit',
      recommendationId: 'coach-protein',
      status: 'accepted',
      title: 'Stärk proteinbasen',
      updatedAt: '2026-07-29T12:00:00.000Z',
    },
    {
      action: 'Gör en kort check-in.',
      area: 'activity',
      id: 'coach-checkin',
      recommendationId: 'coach-checkin',
      status: 'postponed',
      title: 'Fyll aktivitetsbilden',
      updatedAt: '2026-07-28T12:00:00.000Z',
    },
  ],
}

describe('adaptiveCoachTimeline', () => {
  it('builds deterministic timeline events from feedback and linked outcomes', () => {
    const timeline = buildAdaptiveCoachTimeline({
      adaptiveCoachFeedback: feedback,
      goalsHabits: { habits: [{ id: 'habit-1', status: 'active', title: 'Protein', category: 'protein' }] },
    }, { analysisDate, now })

    expect(timeline.events.length).toBeGreaterThanOrEqual(3)
    expect(timeline.events[0].occurredAt >= timeline.events.at(-1).occurredAt).toBe(true)
    expect(new Set(timeline.events.map((event) => event.id)).size).toBe(timeline.events.length)
    expect(timeline.events.some((event) => event.isDerived)).toBe(true)
  })

  it('keeps older feedback without explicit events compatible', () => {
    const normalized = normalizeAdaptiveCoachFeedback({ actions: [{ id: 'old', status: 'dismissed', title: 'Gammalt råd', updatedAt: now }] }, { now })
    const timeline = buildAdaptiveCoachTimeline({ adaptiveCoachFeedback: normalized }, { analysisDate, now })

    expect(timeline.events.some((event) => event.eventType === 'recommendationDismissed')).toBe(true)
  })

  it('appends explicit timeline events with dedupe and size limit', () => {
    const withEvent = appendAdaptiveCoachTimelineEvent(feedback, {
      eventType: 'actionDuplicatePrevented',
      occurredAt: now,
      recommendationId: 'coach-protein',
      summary: 'Dubblett stoppades.',
      title: 'Dubblett stoppad',
    }, { now })
    const duplicate = appendAdaptiveCoachTimelineEvent(withEvent, {
      eventType: 'actionDuplicatePrevented',
      occurredAt: now,
      recommendationId: 'coach-protein',
      summary: 'Dubblett stoppades.',
      title: 'Dubblett stoppad',
    }, { now })

    expect(duplicate.events.filter((event) => event.eventType === 'actionDuplicatePrevented')).toHaveLength(1)
  })

  it.each([
    ['completed', { goalsHabits: { goals: [{ id: 'goal-1', status: 'completed' }] }, linkedEntityId: 'goal-1', linkedEntityType: 'goal' }],
    ['paused', { goalsHabits: { habits: [{ id: 'habit-2', status: 'paused' }] }, linkedEntityId: 'habit-2', linkedEntityType: 'habit' }],
    ['archived', { reminderState: { reminders: [{ archivedAt: now, id: 'reminder-1' }] }, linkedEntityId: 'reminder-1', linkedEntityType: 'reminder' }],
    ['unknown', { linkedEntityId: 'missing', linkedEntityType: 'goal' }],
  ])('resolves linked outcome %s', (outcome, context) => {
    expect(resolveCoachActionOutcome(context, context, { now }).outcome).toBe(outcome)
  })

  it('builds stable summary rates and latest outcome', () => {
    const summary = buildAdaptiveCoachTimelineSummary({
      adaptiveCoachFeedback: feedback,
      goalsHabits: { habits: [{ id: 'habit-1', status: 'completed', title: 'Protein' }] },
    }, { analysisDate, now })

    expect(summary.recommendations).toBe(2)
    expect(summary.activeActions).toBe(1)
    expect(summary.latestEvent).toBeTruthy()
    expect(summary.conversionRate).toBe(50)
  })

  it('explains adaptation without profiling language', () => {
    const explanation = explainCoachAdaptation({ feedbackStatus: 'dismissed' })

    expect(explanation).toContain('inte relevant')
    expect(explanation).not.toMatch(/motivation|personlighet|diagnos/i)
  })

  it('renders timeline UI with filters and no technical values', () => {
    const markup = renderToStaticMarkup(
      <AdaptiveCoachTimeline
        adaptiveCoachFeedback={feedback}
        analysisDate={analysisDate}
        goalsHabits={{ habits: [{ id: 'habit-1', status: 'active', title: 'Protein' }] }}
        onClose={() => {}}
      />,
    )

    expect(markup).toContain('Coach Timeline V6')
    expect(markup).toContain('Coachhistorik')
    expect(markup).toContain('Filtrera coachhistorik')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toMatch(/\b(undefined|null|NaN|Infinity)\b|\[object Object\]/)
  })
})
