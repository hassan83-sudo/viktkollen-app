import { FEATURE_CLASSIFICATION, USAGE_EVENT_TYPES, USAGE_UNITS } from './catalog.js'

/**
 * Canonical feature IDs reuse BILL-1 event_type values where metering applies.
 * Aliases (food_scan, …) resolve to the same id. Live flags come from this
 * repo's API inventory — not from the alias existing.
 */
export const BILLING_FEATURES = Object.freeze({
  'ai.ear.interpret': Object.freeze({
    aliases: Object.freeze(['ai_ear', 'ai_ear_interpret']),
    classification: FEATURE_CLASSIFICATION.EXTERNAL_COST,
    event_type: 'ai.ear.interpret',
    integration: 'live_api',
    metered: true,
    unit: 'requests',
  }),
  'ai.eye.analysis': Object.freeze({
    aliases: Object.freeze(['ai_eye', 'ai_eye_analysis']),
    classification: FEATURE_CLASSIFICATION.EXTERNAL_COST,
    event_type: 'ai.eye.analysis',
    integration: 'live_api',
    metered: true,
    unit: 'requests',
  }),
  'ai.text.request': Object.freeze({
    aliases: Object.freeze(['ai_text', 'ai_coach']),
    classification: FEATURE_CLASSIFICATION.EXTERNAL_COST,
    event_type: 'ai.text.request',
    integration: 'live_api',
    metered: true,
    unit: 'requests',
  }),
  'ai.voice.session': Object.freeze({
    aliases: Object.freeze(['ai_voice']),
    classification: FEATURE_CLASSIFICATION.PARTIAL,
    event_type: 'ai.voice.session',
    integration: 'catalog_only',
    metered: true,
    unit: 'sessions',
  }),
  'body.scan': Object.freeze({
    aliases: Object.freeze(['body_scan']),
    classification: FEATURE_CLASSIFICATION.EXTERNAL_COST,
    event_type: 'body.scan',
    integration: 'live_api',
    metered: true,
    unit: 'requests',
  }),
  'food.scan': Object.freeze({
    aliases: Object.freeze(['food_scan']),
    classification: FEATURE_CLASSIFICATION.EXTERNAL_COST,
    event_type: 'food.scan',
    integration: 'live_api',
    metered: true,
    unit: 'requests',
  }),
  'gps.live.session': Object.freeze({
    aliases: Object.freeze(['gps_live']),
    classification: FEATURE_CLASSIFICATION.PARTIAL,
    event_type: 'gps.live.session',
    integration: 'catalog_only',
    metered: true,
    unit: 'sessions',
  }),
  'tts.request': Object.freeze({
    aliases: Object.freeze(['tts']),
    classification: FEATURE_CLASSIFICATION.PARTIAL,
    event_type: 'tts.request',
    integration: 'catalog_only',
    metered: true,
    unit: 'requests',
  }),
  friend_chat: Object.freeze({
    aliases: Object.freeze(['friendChat']),
    classification: FEATURE_CLASSIFICATION.LOCAL_FREE,
    event_type: null,
    integration: 'unmetered_local',
    metered: false,
    unit: 'writes',
  }),
  gps_standard: Object.freeze({
    aliases: Object.freeze(['gpsStandard']),
    classification: FEATURE_CLASSIFICATION.LOCAL_FREE,
    event_type: null,
    integration: 'unmetered_local',
    metered: false,
    unit: 'sessions',
  }),
  ready_avatar: Object.freeze({
    aliases: Object.freeze(['readyAvatar']),
    classification: FEATURE_CLASSIFICATION.LOCAL_FREE,
    event_type: null,
    integration: 'unmetered_local',
    metered: false,
    unit: 'writes',
  }),
  smart_ai: Object.freeze({
    aliases: Object.freeze(['smartAi']),
    classification: FEATURE_CLASSIFICATION.PARTIAL,
    event_type: null,
    integration: 'umbrella_not_a_meter',
    metered: false,
    unit: 'requests',
  }),
})

const aliasToId = new Map()
for (const [id, feature] of Object.entries(BILLING_FEATURES)) {
  aliasToId.set(id, id)
  for (const alias of feature.aliases) aliasToId.set(alias, id)
}

export function resolveFeatureId(value) {
  const raw = String(value || '').trim()
  return aliasToId.get(raw) || null
}

export function getFeatureDefinition(value) {
  const id = resolveFeatureId(value)
  return id ? BILLING_FEATURES[id] : null
}

export function assertBillingUnit(unit) {
  return USAGE_UNITS.includes(String(unit || '').trim())
}

export function knownMeteredEventTypes() {
  return USAGE_EVENT_TYPES.slice()
}

export function canonicalFeatureIds() {
  return Object.keys(BILLING_FEATURES)
}

export function createFeatureRegistry(entries) {
  const byId = new Map()
  for (const entry of entries) {
    const id = String(entry?.feature_id || '').trim()
    const classification = entry?.classification
    if (!id) {
      const error = new Error('invalid_feature_id')
      error.code = 'invalid_feature_id'
      throw error
    }
    if (byId.has(id)) {
      const error = new Error('duplicate_feature_id')
      error.code = 'duplicate_feature_id'
      throw error
    }
    if (!Object.values(FEATURE_CLASSIFICATION).includes(classification)) {
      const error = new Error('invalid_classification')
      error.code = 'invalid_classification'
      throw error
    }
    byId.set(id, Object.freeze({ classification, feature_id: id }))
  }
  return Object.freeze({
    get(featureId) {
      return byId.get(featureId) || null
    },
    has(featureId) {
      return byId.has(featureId)
    },
    ids() {
      return [...byId.keys()]
    },
  })
}

export const defaultFeatureRegistry = createFeatureRegistry(
  Object.entries(BILLING_FEATURES).map(([feature_id, feature]) => ({
    classification: feature.classification,
    feature_id,
  })),
)
