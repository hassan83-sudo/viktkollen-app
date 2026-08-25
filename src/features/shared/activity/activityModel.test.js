import { describe, expect, it } from 'vitest'
import {
  createActivityDraft,
  estimateActivityCaloriesKcal,
  getActivityProposal,
} from './activityModel.js'

describe('activityModel', () => {
  it('never auto-labels a sport from GPS and always requires confirmation', () => {
    const proposal = getActivityProposal({
      activityType: 'football',
      confidence: 0.99,
      durationMinutes: 63,
      source: 'gps',
    })
    expect(proposal.canAutoAdd).toBe(false)
    expect(proposal.needsUserConfirmation).toBe(true)
    expect(proposal.prompt).toMatch(/cirka 63 minuter/)
    expect(proposal.prompt).not.toMatch(/Du spelade fotboll i 63 minuter/)
  })

  it('asks the user what they did when type or confidence is missing', () => {
    const unknown = getActivityProposal({ durationMinutes: 45, source: 'device-sensors' })
    expect(unknown.status).toBe('needs-type')
    expect(unknown.prompt).toContain('Vad gjorde du?')
  })

  it('treats calories as an estimate only', () => {
    const draft = createActivityDraft({ activityType: 'walk', durationMinutes: 30, source: 'manual' })
    const estimated = estimateActivityCaloriesKcal(draft, { kcalPerMinute: 4 })
    expect(estimated.caloriesEstimateKcal).toBe(120)
    expect(estimated.caloriesIsEstimate).toBe(true)
    expect(estimated.disclaimer).toMatch(/uppskattning/)
  })
})
