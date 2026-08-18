import { describe, expect, it } from 'vitest'

import {
  buildRecommendedPremiumModel,
  createDefaultEntitlementSnapshot,
  entitlementFeatures,
  entitlementPlans,
  entitlementStatus,
  getFeatureAccess,
  normalizeEntitlementSnapshot,
} from './entitlements.js'

describe('entitlements', () => {
  it('defaults every user to free without fake payment identifiers', () => {
    const snapshot = createDefaultEntitlementSnapshot({ userId: 'user-a' })

    expect(snapshot.plan).toBe(entitlementPlans.FREE)
    expect(snapshot.status).toBe(entitlementStatus.NONE)
    expect(snapshot.provider).toBe('none')
    expect(snapshot.providerSubscriptionId).toBe('')
  })

  it('allows useful free features but blocks premium-only features', () => {
    const snapshot = createDefaultEntitlementSnapshot()

    expect(getFeatureAccess(snapshot, entitlementFeatures.weightAndCheckIn).allowed).toBe(true)
    expect(getFeatureAccess(snapshot, entitlementFeatures.nutritionBasics).allowed).toBe(true)
    expect(getFeatureAccess(snapshot, entitlementFeatures.healthPredictions).reason).toBe('premium_required')
  })

  it('enforces free usage limits centrally', () => {
    const snapshot = createDefaultEntitlementSnapshot()

    expect(getFeatureAccess(snapshot, entitlementFeatures.bodyAnalysis, {
      usage: { bodyAnalysisScans: 2 },
    })).toMatchObject({
      allowed: true,
      remaining: 1,
      reason: 'free_limit',
    })
    expect(getFeatureAccess(snapshot, entitlementFeatures.bodyAnalysis, {
      usage: { bodyAnalysisScans: 3 },
    })).toMatchObject({
      allowed: false,
      reason: 'free_limit_reached',
    })
  })

  it('requires active non-expired premium or trial status for paid access', () => {
    const premium = normalizeEntitlementSnapshot({
      currentPeriodEnd: '2099-01-01T00:00:00.000Z',
      plan: entitlementPlans.PREMIUM,
      status: entitlementStatus.ACTIVE,
    })
    const expired = normalizeEntitlementSnapshot({
      currentPeriodEnd: '2020-01-01T00:00:00.000Z',
      plan: entitlementPlans.PREMIUM,
      status: entitlementStatus.ACTIVE,
    })

    expect(getFeatureAccess(premium, entitlementFeatures.cloudSync).allowed).toBe(true)
    expect(getFeatureAccess(expired, entitlementFeatures.cloudSync).allowed).toBe(false)
  })

  it('documents a balanced recommended product model', () => {
    const model = buildRecommendedPremiumModel()

    expect(model.free).toContain(entitlementFeatures.weightAndCheckIn)
    expect(model.free).toContain(entitlementFeatures.dataExportImport)
    expect(model.premium).toContain(entitlementFeatures.healthPredictions)
    expect(model.premium).not.toContain(entitlementFeatures.weightAndCheckIn)
  })
})
