import { describe, expect, it } from 'vitest'
import { FEATURE_AVAILABILITY, FEATURE_CLASSIFICATION, FEATURE_MODE } from './catalog.js'
import {
  assertFeatureControl,
  resolveFeatureAvailability,
} from './featureAvailability.js'
import {
  BILLING_FEATURES,
  createFeatureRegistry,
  canonicalFeatureIds,
  resolveFeatureId,
} from './features.js'

const CONTROL = {
  feature_id: 'food.scan',
  mode: FEATURE_MODE.ENABLED,
  reason_code: 'MANUAL_ADMIN',
  version: 1,
}

describe('BILL-4B1a feature registry', () => {
  it('finds canonical known features and maps aliases', () => {
    expect(canonicalFeatureIds()).toEqual(Object.keys(BILLING_FEATURES))
    expect(resolveFeatureId('food_scan')).toBe('food.scan')
    expect(BILLING_FEATURES['food.scan'].classification).toBe(FEATURE_CLASSIFICATION.EXTERNAL_COST)
    expect(BILLING_FEATURES.ready_avatar.classification).toBe(FEATURE_CLASSIFICATION.LOCAL_FREE)
    expect(BILLING_FEATURES['tts.request'].classification).toBe(FEATURE_CLASSIFICATION.PARTIAL)
    expect(BILLING_FEATURES.smart_ai.classification).toBe(FEATURE_CLASSIFICATION.PARTIAL)
  })

  it('rejects unknown features, duplicates, and invalid classification', () => {
    expect(resolveFeatureId('not.a.feature')).toBeNull()
    expect(() => createFeatureRegistry([
      { classification: FEATURE_CLASSIFICATION.LOCAL_FREE, feature_id: 'dup' },
      { classification: FEATURE_CLASSIFICATION.LOCAL_FREE, feature_id: 'dup' },
    ])).toThrow(/duplicate_feature_id/)
    expect(() => createFeatureRegistry([
      { classification: 'PAID', feature_id: 'x' },
    ])).toThrow(/invalid_classification/)
  })
})

describe('BILL-4B1a availability resolver', () => {
  it('returns AVAILABLE for a known ENABLED feature', () => {
    const result = resolveFeatureAvailability({ control: CONTROL, featureId: 'food.scan' })
    expect(result.result).toBe(FEATURE_AVAILABILITY.AVAILABLE)
    expect(result.quota_enforced).toBe(false)
    expect(result.cost_enforced).toBe(false)
    expect(result.metering_complete).toBe(false)
  })

  it('returns DISABLED for a known DISABLED feature', () => {
    const result = resolveFeatureAvailability({
      control: { ...CONTROL, mode: FEATURE_MODE.DISABLED, reason_code: 'SECURITY' },
      featureId: 'food.scan',
    })
    expect(result.result).toBe(FEATURE_AVAILABILITY.DISABLED)
  })

  it('returns MAINTENANCE separately from DISABLED', () => {
    const result = resolveFeatureAvailability({
      control: {
        feature_id: 'ai.text.request',
        mode: FEATURE_MODE.MAINTENANCE,
        reason_code: 'MAINTENANCE',
        version: 1,
      },
      featureId: 'ai.text.request',
    })
    expect(result.result).toBe(FEATURE_AVAILABILITY.MAINTENANCE)
  })

  it('fail-safes unknown features', () => {
    const result = resolveFeatureAvailability({ featureId: 'secret.nuke' })
    expect(result.result).toBe(FEATURE_AVAILABILITY.UNKNOWN_FEATURE)
    expect(result.result).not.toBe(FEATURE_AVAILABILITY.AVAILABLE)
  })

  it('defaults a known feature without control to AVAILABLE', () => {
    const result = resolveFeatureAvailability({ featureId: 'ready_avatar' })
    expect(result.result).toBe(FEATURE_AVAILABILITY.AVAILABLE)
    expect(result.defaulted).toBe(true)
    expect(result.mode).toBe(FEATURE_MODE.ENABLED)
  })

  it('blocks invalid mode, version, and reason', () => {
    expect(() => assertFeatureControl({ ...CONTROL, mode: 'PAUSED' })).toThrow(/invalid_feature_mode/)
    expect(() => assertFeatureControl({ ...CONTROL, version: 0 })).toThrow(/invalid_feature_version/)
    expect(() => assertFeatureControl({ ...CONTROL, version: -1 })).toThrow(/invalid_feature_version/)
    expect(() => assertFeatureControl({ ...CONTROL, version: 1.5 })).toThrow(/invalid_feature_version/)
    expect(() => assertFeatureControl({ ...CONTROL, version: Number.NaN })).toThrow(/invalid_feature_version/)
    expect(() => assertFeatureControl({
      ...CONTROL,
      mode: FEATURE_MODE.DISABLED,
      reason_code: 'COST_CONTROL',
    })).toThrow(/invalid_reason_code/)
  })

  it('ignores client spoof flags when control is DISABLED', () => {
    const result = resolveFeatureAvailability({
      clientClaim: { featureEnabled: true, isAdmin: true, modeOverride: 'ENABLED' },
      control: { ...CONTROL, mode: FEATURE_MODE.DISABLED, reason_code: 'SECURITY' },
      featureId: 'food.scan',
    })
    expect(result.result).toBe(FEATURE_AVAILABILITY.DISABLED)
  })

  it('applies the same operational modes to all classifications without claiming quota or cost', () => {
    const local = resolveFeatureAvailability({
      control: { feature_id: 'friend_chat', mode: FEATURE_MODE.DISABLED, reason_code: 'SECURITY', version: 1 },
      featureId: 'friend_chat',
    })
    expect(local.classification).toBe(FEATURE_CLASSIFICATION.LOCAL_FREE)
    expect(local.result).toBe(FEATURE_AVAILABILITY.DISABLED)
    expect(local.quota_enforced).toBe(false)

    const partial = resolveFeatureAvailability({
      control: { feature_id: 'tts.request', mode: FEATURE_MODE.ENABLED, version: 1 },
      featureId: 'tts.request',
    })
    expect(partial.classification).toBe(FEATURE_CLASSIFICATION.PARTIAL)
    expect(partial.result).toBe(FEATURE_AVAILABILITY.AVAILABLE)
    expect(partial.metering_complete).toBe(false)

    const external = resolveFeatureAvailability({
      control: { feature_id: 'body.scan', mode: FEATURE_MODE.MAINTENANCE, reason_code: 'MAINTENANCE', version: 2 },
      featureId: 'body.scan',
    })
    expect(external.classification).toBe(FEATURE_CLASSIFICATION.EXTERNAL_COST)
    expect(external.result).toBe(FEATURE_AVAILABILITY.MAINTENANCE)
    expect(external.cost_enforced).toBe(false)
  })
})
