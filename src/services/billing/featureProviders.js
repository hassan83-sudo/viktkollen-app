import { BILLING_FEATURES, canonicalFeatureIds, resolveFeatureId } from './features.js'
import { resolveProviderId } from './providers.js'

/**
 * Required external providers per canonical BILL-4B1a feature.
 * Empty list = no external provider (local/browser or catalog-only without a live hop).
 * Verified against api/* + BILL-1; not inferred from "AI" in the name.
 */
export const FEATURE_REQUIRED_PROVIDERS = Object.freeze({
  'ai.ear.interpret': Object.freeze(['google.cloud_run.ai_ear']),
  'ai.eye.analysis': Object.freeze(['openai']),
  'ai.text.request': Object.freeze(['openai']),
  'ai.voice.session': Object.freeze(['openai']),
  'body.scan': Object.freeze(['openai']),
  'food.scan': Object.freeze(['openai']),
  'gps.live.session': Object.freeze([]),
  'tts.request': Object.freeze([]),
  friend_chat: Object.freeze([]),
  gps_standard: Object.freeze([]),
  ready_avatar: Object.freeze([]),
  smart_ai: Object.freeze([]),
})

function assertCompleteMapping() {
  for (const featureId of canonicalFeatureIds()) {
    if (!Object.prototype.hasOwnProperty.call(FEATURE_REQUIRED_PROVIDERS, featureId)) {
      const error = new Error('incomplete_feature_provider_mapping')
      error.code = 'incomplete_feature_provider_mapping'
      throw error
    }
  }
  for (const [featureId, providers] of Object.entries(FEATURE_REQUIRED_PROVIDERS)) {
    if (!BILLING_FEATURES[featureId]) {
      const error = new Error('unknown_mapped_feature')
      error.code = 'unknown_mapped_feature'
      throw error
    }
    for (const providerId of providers) {
      if (!resolveProviderId(providerId)) {
        const error = new Error('unknown_mapped_provider')
        error.code = 'unknown_mapped_provider'
        throw error
      }
    }
  }
}

assertCompleteMapping()

export function requiredProvidersForFeature(featureId) {
  const canonical = resolveFeatureId(featureId)
  if (!canonical) return null
  return FEATURE_REQUIRED_PROVIDERS[canonical]
}
