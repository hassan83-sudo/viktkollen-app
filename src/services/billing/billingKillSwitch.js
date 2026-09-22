import { FEATURE_MODE, PROVIDER_MODE } from './catalog.js'
import { FOOD_SCAN_CANARY } from './foodScanCanary.js'

/**
 * HTTP kill-switch surface for BILL-5B3C. Narrower than the SQL catalog:
 * only food.scan ENABLE/DISABLE and openai AVAILABLE/UNAVAILABLE.
 * Client cannot select RPCs, schemas, or tables.
 */
export const OPERABLE_KILL_SWITCHES = Object.freeze({
  features: Object.freeze({
    [FOOD_SCAN_CANARY.feature_id]: Object.freeze([FEATURE_MODE.DISABLED, FEATURE_MODE.ENABLED]),
  }),
  providers: Object.freeze({
    [FOOD_SCAN_CANARY.provider_id]: Object.freeze([PROVIDER_MODE.AVAILABLE, PROVIDER_MODE.UNAVAILABLE]),
  }),
})

export const KILL_SWITCH_ACTION = Object.freeze({
  SET_FEATURE_CONTROL: 'set_feature_control',
  SET_PROVIDER_CONTROL: 'set_provider_control',
})

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

export function assertOperableFeatureKillSwitch({ featureId, mode } = {}) {
  const id = String(featureId || '').trim()
  const next = String(mode || '').trim()
  const allowed = OPERABLE_KILL_SWITCHES.features[id]
  if (!allowed) fail('unknown_feature')
  if (!allowed.includes(next)) fail('invalid_feature_mode')
  return Object.freeze({ featureId: id, mode: next })
}

export function assertOperableProviderKillSwitch({ mode, providerId } = {}) {
  const id = String(providerId || '').trim()
  const next = String(mode || '').trim()
  const allowed = OPERABLE_KILL_SWITCHES.providers[id]
  if (!allowed) fail('unknown_provider')
  if (!allowed.includes(next)) fail('invalid_provider_mode')
  return Object.freeze({ mode: next, providerId: id })
}

export function defaultKillSwitchReason({ kind, mode } = {}) {
  if (kind === 'feature') {
    return mode === FEATURE_MODE.DISABLED ? 'SECURITY' : 'MANUAL_ADMIN'
  }
  return mode === PROVIDER_MODE.UNAVAILABLE ? 'PROVIDER_OUTAGE' : 'MANUAL_ADMIN'
}
