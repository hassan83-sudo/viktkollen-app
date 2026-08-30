import { describe, expect, it } from 'vitest'

import { onboardingStartWeightId, upsertOnboardingStartWeight } from './services/onboardingPersistence.js'

describe('onboarding persistence helpers', () => {
  it('creates a real measured start weight entry from onboarding', () => {
    const weights = upsertOnboardingStartWeight([], { startWeight: '91,8' }, new Date('2026-08-30T09:15:00.000Z'))

    expect(weights).toHaveLength(1)
    expect(weights[0]).toMatchObject({
      id: onboardingStartWeightId,
      note: 'Startvikt från onboarding',
      source: 'Manuell',
      value: 91.8,
      weight: 91.8,
    })
  })

  it('updates the onboarding start weight without creating duplicates', () => {
    const first = upsertOnboardingStartWeight([], { startWeight: '91,8' }, new Date('2026-08-30T09:15:00.000Z'))
    const second = upsertOnboardingStartWeight(first, { startWeight: '90,4' }, new Date('2026-08-30T10:15:00.000Z'))

    expect(second).toHaveLength(1)
    expect(second[0]).toMatchObject({
      id: onboardingStartWeightId,
      value: 90.4,
      weight: 90.4,
    })
  })
})
