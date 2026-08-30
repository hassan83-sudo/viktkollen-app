import { normalizeWeights } from './progressService.js'

export const onboardingStartWeightId = 'onboarding-start-weight'

function parseOnboardingStartWeight(profile) {
  const value = Number.parseFloat(String(profile?.startWeight || '').replace(',', '.'))

  return Number.isFinite(value) && value > 0 && value <= 500 ? value : null
}

export function upsertOnboardingStartWeight(weights, profile, now = new Date()) {
  const value = parseOnboardingStartWeight(profile)
  const normalizedWeights = normalizeWeights(weights)
  if (value === null) return normalizedWeights

  const timestamp = now.toISOString()
  const existing = normalizedWeights.find((entry) => entry.id === onboardingStartWeightId)
  if (existing) {
    return normalizeWeights(normalizedWeights.map((entry) => (
      entry.id === onboardingStartWeightId
        ? {
            ...entry,
            source: entry.source || 'Manuell',
            updatedAt: timestamp,
            value,
            weight: value,
          }
        : entry
    )))
  }

  return normalizeWeights([
    ...normalizedWeights,
    {
      createdAt: timestamp,
      id: onboardingStartWeightId,
      note: 'Startvikt från onboarding',
      source: 'Manuell',
      updatedAt: timestamp,
      value,
      weight: value,
    },
  ])
}
