import { describe, expect, it } from 'vitest'
import { buildCoachMemory } from './coachMemoryBuilder.js'

const now = '2026-08-05T12:00:00.000Z'

describe('coachMemoryBuilder', () => {
  it('is deterministic and uses completed outcomes as success evidence', () => {
    const input = {
      adaptiveCoachFeedback: {
        recommendations: [
          { area: 'nutrition', status: 'accepted', title: 'Protein', updatedAt: now },
          { area: 'activity', status: 'completed', title: 'Promenad', updatedAt: now },
        ],
      },
    }
    const first = buildCoachMemory(input, { analysisDate: '2026-08-05', now })
    const second = buildCoachMemory(input, { analysisDate: '2026-08-05', now })

    expect(first).toEqual(second)
    expect(first.successfulStrategies.map((item) => item.category)).toContain('activity')
    expect(first.successfulStrategies.map((item) => item.category)).not.toContain('nutrition')
  })

  it('requires repeated dismissals or friction before declined strategies and barriers', () => {
    const oneDismiss = buildCoachMemory({
      adaptiveCoachFeedback: {
        history: [{ area: 'nutrition', at: now, status: 'dismissed', title: 'A' }],
      },
    }, { now })
    const repeated = buildCoachMemory({
      adaptiveCoachFeedback: {
        history: [
          { area: 'nutrition', at: now, status: 'dismissed', title: 'A' },
          { area: 'nutrition', at: '2026-08-04T12:00:00.000Z', status: 'dismissed', title: 'B' },
        ],
      },
    }, { now })

    expect(oneDismiss.declinedStrategies).toHaveLength(0)
    expect(oneDismiss.recurringBarriers).toHaveLength(0)
    expect(repeated.declinedStrategies[0].category).toBe('nutrition')
    expect(repeated.recurringBarriers[0].category).toBe('nutrition')
  })

  it('decays stale evidence and does not infer medical or personality traits', () => {
    const memory = buildCoachMemory({
      adaptiveCoachFeedback: {
        recommendations: [{ area: 'recovery', completedAt: '2025-01-01T12:00:00.000Z', status: 'completed', title: 'A', updatedAt: '2025-01-01T12:00:00.000Z' }],
      },
    }, { now })

    expect(memory.successfulStrategies).toHaveLength(0)
    expect(JSON.stringify(memory)).not.toMatch(/diagnos|personlighet|medicin/i)
  })
})
