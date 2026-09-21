import { describe, expect, it } from 'vitest'
import {
  FEATURE_CLASSIFICATION,
  FEATURE_MODE,
  OPERATIONAL_AVAILABILITY,
  PROVIDER_AVAILABILITY,
  PROVIDER_CLASSIFICATION,
  PROVIDER_MODE,
} from './catalog.js'
import { canonicalFeatureIds } from './features.js'
import { FEATURE_REQUIRED_PROVIDERS, requiredProvidersForFeature } from './featureProviders.js'
import { resolveOperationalAvailability } from './operationalAvailability.js'
import {
  assertProviderControl,
  resolveProviderAvailability,
} from './providerAvailability.js'
import {
  BILLING_PROVIDERS,
  canonicalProviderIds,
  createProviderRegistry,
  resolveProviderId,
} from './providers.js'

const OPENAI = {
  provider_id: 'openai',
  mode: PROVIDER_MODE.AVAILABLE,
  reason_code: 'MANUAL_ADMIN',
  version: 1,
}

describe('BILL-4B2a provider registry', () => {
  it('finds canonical known providers and fail-safes unknown ids', () => {
    expect(canonicalProviderIds()).toEqual(['openai', 'google.cloud_run.ai_ear'])
    expect(resolveProviderId('openai')).toBe('openai')
    expect(BILLING_PROVIDERS.openai.classification).toBe(PROVIDER_CLASSIFICATION.EXTERNAL_API)
    expect(BILLING_PROVIDERS['google.cloud_run.ai_ear'].classification).toBe(
      PROVIDER_CLASSIFICATION.EXTERNAL_COMPUTE,
    )
    const unknown = resolveProviderAvailability({ providerId: 'acme.magic' })
    expect(unknown.result).toBe(PROVIDER_AVAILABILITY.UNKNOWN_PROVIDER)
    expect(unknown.result).not.toBe(PROVIDER_AVAILABILITY.PROVIDER_AVAILABLE)
  })

  it('rejects duplicate provider IDs and invalid classification', () => {
    expect(() => createProviderRegistry([
      { classification: PROVIDER_CLASSIFICATION.EXTERNAL_API, provider_id: 'dup' },
      { classification: PROVIDER_CLASSIFICATION.EXTERNAL_API, provider_id: 'dup' },
    ])).toThrow(/duplicate_provider_id/)
    expect(() => createProviderRegistry([
      { classification: 'CDN', provider_id: 'x' },
    ])).toThrow(/invalid_provider_classification/)
  })
})

describe('BILL-4B2a provider availability', () => {
  it('returns PROVIDER_AVAILABLE for AVAILABLE and known default', () => {
    expect(resolveProviderAvailability({
      control: OPENAI,
      providerId: 'openai',
    }).result).toBe(PROVIDER_AVAILABILITY.PROVIDER_AVAILABLE)
    const def = resolveProviderAvailability({ providerId: 'openai' })
    expect(def.result).toBe(PROVIDER_AVAILABILITY.PROVIDER_AVAILABLE)
    expect(def.defaulted).toBe(true)
    expect(def.mode).toBe(PROVIDER_MODE.AVAILABLE)
  })

  it('returns PROVIDER_UNAVAILABLE and PROVIDER_MAINTENANCE', () => {
    expect(resolveProviderAvailability({
      control: { ...OPENAI, mode: PROVIDER_MODE.UNAVAILABLE, reason_code: 'PROVIDER_OUTAGE' },
      providerId: 'openai',
    }).result).toBe(PROVIDER_AVAILABILITY.PROVIDER_UNAVAILABLE)
    expect(resolveProviderAvailability({
      control: { ...OPENAI, mode: PROVIDER_MODE.MAINTENANCE, reason_code: 'MAINTENANCE' },
      providerId: 'openai',
    }).result).toBe(PROVIDER_AVAILABILITY.PROVIDER_MAINTENANCE)
  })

  it('blocks invalid mode, version, and reason', () => {
    expect(() => assertProviderControl({ ...OPENAI, mode: 'DOWN' })).toThrow(/invalid_provider_mode/)
    expect(() => assertProviderControl({ ...OPENAI, version: 0 })).toThrow(/invalid_provider_version/)
    expect(() => assertProviderControl({ ...OPENAI, version: -1 })).toThrow(/invalid_provider_version/)
    expect(() => assertProviderControl({ ...OPENAI, version: 1.5 })).toThrow(/invalid_provider_version/)
    expect(() => assertProviderControl({ ...OPENAI, version: Number.NaN })).toThrow(/invalid_provider_version/)
    expect(() => assertProviderControl({
      ...OPENAI,
      mode: PROVIDER_MODE.UNAVAILABLE,
      reason_code: 'COST_CONTROL',
    })).toThrow(/invalid_reason_code/)
  })

  it('rejects secret fields on the provider model', () => {
    expect(() => assertProviderControl({ ...OPENAI, api_key: 'sk-test' })).toThrow(/rejected_secret_field/)
    expect(() => assertProviderControl({ ...OPENAI, secret: 'x' })).toThrow(/rejected_secret_field/)
    expect(() => assertProviderControl({ ...OPENAI, token: 'x' })).toThrow(/rejected_secret_field/)
    expect(() => assertProviderControl({ ...OPENAI, password: 'x' })).toThrow(/rejected_secret_field/)
  })
})

describe('BILL-4B2a feature-provider mapping', () => {
  it('maps every canonical feature from live inventory and keeps locals isolated', () => {
    expect(Object.keys(FEATURE_REQUIRED_PROVIDERS).sort()).toEqual([...canonicalFeatureIds()].sort())
    expect(requiredProvidersForFeature('ai.ear.interpret')).toEqual(['google.cloud_run.ai_ear'])
    expect(requiredProvidersForFeature('ai.eye.analysis')).toEqual(['openai'])
    expect(requiredProvidersForFeature('ai.text.request')).toEqual(['openai'])
    expect(requiredProvidersForFeature('ai.voice.session')).toEqual(['openai'])
    expect(requiredProvidersForFeature('body.scan')).toEqual(['openai'])
    expect(requiredProvidersForFeature('food.scan')).toEqual(['openai'])
    expect(requiredProvidersForFeature('gps.live.session')).toEqual([])
    expect(requiredProvidersForFeature('tts.request')).toEqual([])
    expect(requiredProvidersForFeature('friend_chat')).toEqual([])
    expect(requiredProvidersForFeature('gps_standard')).toEqual([])
    expect(requiredProvidersForFeature('ready_avatar')).toEqual([])
    expect(requiredProvidersForFeature('smart_ai')).toEqual([])
    expect(FEATURE_CLASSIFICATION.LOCAL_FREE).toBe('LOCAL_FREE')
  })
})

describe('BILL-4B2a operational resolver', () => {
  it('lets feature DISABLED and MAINTENANCE win over an AVAILABLE provider', () => {
    const disabled = resolveOperationalAvailability({
      featureControl: {
        feature_id: 'food.scan',
        mode: FEATURE_MODE.DISABLED,
        reason_code: 'SECURITY',
        version: 1,
      },
      featureId: 'food.scan',
      providerControls: [OPENAI],
    })
    expect(disabled.result).toBe(OPERATIONAL_AVAILABILITY.DISABLED)
    const maintenance = resolveOperationalAvailability({
      featureControl: {
        feature_id: 'food.scan',
        mode: FEATURE_MODE.MAINTENANCE,
        reason_code: 'MAINTENANCE',
        version: 1,
      },
      featureId: 'food.scan',
      providerControls: [OPENAI],
    })
    expect(maintenance.result).toBe(OPERATIONAL_AVAILABILITY.MAINTENANCE)
  })

  it('returns PROVIDER_UNAVAILABLE and PROVIDER_MAINTENANCE for an ENABLED feature', () => {
    const down = resolveOperationalAvailability({
      featureId: 'ai.text.request',
      providerControls: [{
        ...OPENAI,
        mode: PROVIDER_MODE.UNAVAILABLE,
        reason_code: 'PROVIDER_OUTAGE',
      }],
    })
    expect(down.result).toBe(OPERATIONAL_AVAILABILITY.PROVIDER_UNAVAILABLE)
    const maint = resolveOperationalAvailability({
      featureId: 'body.scan',
      providerControls: [{
        ...OPENAI,
        mode: PROVIDER_MODE.MAINTENANCE,
        reason_code: 'MAINTENANCE',
      }],
    })
    expect(maint.result).toBe(OPERATIONAL_AVAILABILITY.PROVIDER_MAINTENANCE)
  })

  it('keeps local features AVAILABLE during unrelated provider outage', () => {
    const tts = resolveOperationalAvailability({
      featureId: 'tts.request',
      providerControls: [{
        ...OPENAI,
        mode: PROVIDER_MODE.UNAVAILABLE,
        reason_code: 'PROVIDER_OUTAGE',
      }],
    })
    expect(tts.result).toBe(OPERATIONAL_AVAILABILITY.AVAILABLE)
    const chat = resolveOperationalAvailability({
      featureId: 'friend_chat',
      providerControls: [{
        ...OPENAI,
        mode: PROVIDER_MODE.UNAVAILABLE,
        reason_code: 'PROVIDER_OUTAGE',
      }],
    })
    expect(chat.result).toBe(OPERATIONAL_AVAILABILITY.AVAILABLE)
  })

  it('fail-safes unknown feature and unknown required provider', () => {
    const unknownFeature = resolveOperationalAvailability({ featureId: 'secret.nuke' })
    expect(unknownFeature.result).toBe(OPERATIONAL_AVAILABILITY.UNKNOWN_FEATURE)
    const unknownProvider = resolveOperationalAvailability({
      featureId: 'food.scan',
      requiredProviders: ['not.a.provider'],
    })
    expect(unknownProvider.result).toBe(OPERATIONAL_AVAILABILITY.UNKNOWN_PROVIDER)
    expect(unknownProvider.result).not.toBe(OPERATIONAL_AVAILABILITY.AVAILABLE)
  })

  it('defaults known feature/provider without control and ignores client spoof', () => {
    const def = resolveOperationalAvailability({ featureId: 'food.scan' })
    expect(def.result).toBe(OPERATIONAL_AVAILABILITY.AVAILABLE)
    expect(def.defaulted).toBe(true)
    const spoof = resolveOperationalAvailability({
      clientClaim: {
        featureEnabled: true,
        isAdmin: true,
        providerAvailable: true,
      },
      featureControl: {
        feature_id: 'food.scan',
        mode: FEATURE_MODE.DISABLED,
        reason_code: 'SECURITY',
        version: 1,
      },
      featureId: 'food.scan',
      providerControls: [{
        ...OPENAI,
        mode: PROVIDER_MODE.UNAVAILABLE,
        reason_code: 'PROVIDER_OUTAGE',
      }],
    })
    expect(spoof.result).toBe(OPERATIONAL_AVAILABILITY.DISABLED)
  })

  it('denies when any required provider is UNAVAILABLE', () => {
    const result = resolveOperationalAvailability({
      featureId: 'ai.ear.interpret',
      providerControls: [{
        provider_id: 'google.cloud_run.ai_ear',
        mode: PROVIDER_MODE.UNAVAILABLE,
        reason_code: 'PROVIDER_OUTAGE',
        version: 1,
      }],
      requiredProviders: ['openai', 'google.cloud_run.ai_ear'],
    })
    expect(result.result).toBe(OPERATIONAL_AVAILABILITY.PROVIDER_UNAVAILABLE)
  })
})
