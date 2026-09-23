import {
  PROVIDER_AVAILABILITY,
  PROVIDER_CONTROL_REASONS,
  PROVIDER_MODE,
} from './catalog.js'
import { getProviderDefinition, resolveProviderId } from './providers.js'

const SECRET_INPUT_KEYS = Object.freeze(['api_key', 'password', 'secret', 'token'])

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

function rejectSecrets(input = {}) {
  for (const key of Object.keys(input)) {
    if (SECRET_INPUT_KEYS.includes(key)) fail('rejected_secret_field')
  }
}

export function assertProviderControl(control = {}) {
  rejectSecrets(control)
  const providerId = resolveProviderId(control.provider_id)
  if (!providerId) fail('unknown_provider')
  const mode = String(control.mode || '').trim()
  if (!Object.values(PROVIDER_MODE).includes(mode)) fail('invalid_provider_mode')
  const version = control.version
  if (!Number.isInteger(version) || version < 1) fail('invalid_provider_version')
  const reason = control.reason_code
  if (mode === PROVIDER_MODE.AVAILABLE) {
    if (reason != null && reason !== '' && !PROVIDER_CONTROL_REASONS.includes(reason)) {
      fail('invalid_reason_code')
    }
  } else if (!PROVIDER_CONTROL_REASONS.includes(reason)) {
    fail('invalid_reason_code')
  }
  if (control.configured != null && typeof control.configured !== 'boolean') {
    fail('invalid_configured_status')
  }
  return Object.freeze({
    configured: typeof control.configured === 'boolean' ? control.configured : null,
    mode,
    provider_id: providerId,
    reason_code: reason || null,
    version,
  })
}

/**
 * Known provider + no control → AVAILABLE / PROVIDER_AVAILABLE (compatibility).
 * Unknown provider → UNKNOWN_PROVIDER. Client flags ignored. No secrets returned.
 */
export function resolveProviderAvailability({
  clientClaim = {},
  control,
  providerId,
} = {}) {
  void clientClaim.providerAvailable
  void clientClaim.isAdmin
  const canonical = resolveProviderId(providerId)
  if (!canonical) {
    return Object.freeze({
      configured: null,
      provider_id: null,
      result: PROVIDER_AVAILABILITY.UNKNOWN_PROVIDER,
    })
  }
  const definition = getProviderDefinition(canonical)
  const base = {
    classification: definition.classification,
    configured: null,
    provider_id: canonical,
  }
  if (control == null) {
    return Object.freeze({
      ...base,
      defaulted: true,
      mode: PROVIDER_MODE.AVAILABLE,
      result: PROVIDER_AVAILABILITY.PROVIDER_AVAILABLE,
    })
  }
  const validated = assertProviderControl(control)
  if (validated.provider_id !== canonical) fail('provider_control_mismatch')
  if (validated.mode === PROVIDER_MODE.UNAVAILABLE) {
    return Object.freeze({
      ...base,
      configured: validated.configured,
      defaulted: false,
      mode: validated.mode,
      result: PROVIDER_AVAILABILITY.PROVIDER_UNAVAILABLE,
    })
  }
  if (validated.mode === PROVIDER_MODE.MAINTENANCE) {
    return Object.freeze({
      ...base,
      configured: validated.configured,
      defaulted: false,
      mode: validated.mode,
      result: PROVIDER_AVAILABILITY.PROVIDER_MAINTENANCE,
    })
  }
  return Object.freeze({
    ...base,
    configured: validated.configured,
    defaulted: false,
    mode: PROVIDER_MODE.AVAILABLE,
    result: PROVIDER_AVAILABILITY.PROVIDER_AVAILABLE,
  })
}

export function indexProviderControls(controls) {
  if (controls == null) return new Map()
  const list = Array.isArray(controls)
    ? controls
    : typeof controls === 'object'
      ? Object.values(controls)
      : fail('invalid_provider_controls')
  const byId = new Map()
  for (const row of list) {
    if (row == null) continue
    const validated = assertProviderControl(row)
    if (byId.has(validated.provider_id)) fail('duplicate_provider_id')
    byId.set(validated.provider_id, validated)
  }
  return byId
}
