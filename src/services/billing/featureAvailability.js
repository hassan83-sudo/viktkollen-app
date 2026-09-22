import {
  FEATURE_AVAILABILITY,
  FEATURE_CONTROL_REASONS,
  FEATURE_MODE,
} from './catalog.js'
import { getFeatureDefinition, resolveFeatureId } from './features.js'

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

export function assertFeatureControl(control = {}) {
  const featureId = resolveFeatureId(control.feature_id)
  if (!featureId) fail('invalid_feature_id')
  const mode = String(control.mode || '').trim()
  if (!Object.values(FEATURE_MODE).includes(mode)) fail('invalid_feature_mode')
  const version = control.version
  if (!Number.isInteger(version) || version < 1) fail('invalid_feature_version')
  const reason = control.reason_code
  if (mode === FEATURE_MODE.ENABLED) {
    if (reason != null && reason !== '' && !FEATURE_CONTROL_REASONS.includes(reason)) {
      fail('invalid_reason_code')
    }
  } else if (!FEATURE_CONTROL_REASONS.includes(reason)) {
    fail('invalid_reason_code')
  }
  return Object.freeze({
    feature_id: featureId,
    mode,
    reason_code: reason || null,
    version,
  })
}

/**
 * Known existing feature + no control row → ENABLED / AVAILABLE.
 * Unknown feature → UNKNOWN_FEATURE (never AVAILABLE).
 * Client flags are ignored. Does not inspect quota, plan, or provider.
 */
export function resolveFeatureAvailability({
  clientClaim = {},
  control,
  featureId,
} = {}) {
  void clientClaim.featureEnabled
  void clientClaim.isAdmin
  void clientClaim.modeOverride
  const canonical = resolveFeatureId(featureId)
  if (!canonical) {
    return Object.freeze({
      classification: null,
      cost_enforced: false,
      feature_id: null,
      metering_complete: false,
      quota_enforced: false,
      result: FEATURE_AVAILABILITY.UNKNOWN_FEATURE,
    })
  }
  const definition = getFeatureDefinition(canonical)
  const base = {
    classification: definition.classification,
    cost_enforced: false,
    feature_id: canonical,
    metering_complete: false,
    quota_enforced: false,
  }
  if (control == null) {
    return Object.freeze({
      ...base,
      defaulted: true,
      mode: FEATURE_MODE.ENABLED,
      result: FEATURE_AVAILABILITY.AVAILABLE,
    })
  }
  const validated = assertFeatureControl(control)
  if (validated.feature_id !== canonical) fail('feature_control_mismatch')
  if (validated.mode === FEATURE_MODE.DISABLED) {
    return Object.freeze({ ...base, defaulted: false, mode: validated.mode, result: FEATURE_AVAILABILITY.DISABLED })
  }
  if (validated.mode === FEATURE_MODE.MAINTENANCE) {
    return Object.freeze({ ...base, defaulted: false, mode: validated.mode, result: FEATURE_AVAILABILITY.MAINTENANCE })
  }
  return Object.freeze({
    ...base,
    defaulted: false,
    mode: FEATURE_MODE.ENABLED,
    result: FEATURE_AVAILABILITY.AVAILABLE,
  })
}
