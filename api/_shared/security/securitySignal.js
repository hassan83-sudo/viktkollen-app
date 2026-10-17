import { classifySecurityEvent, SECURITY_EVENT_TYPES } from '../../../src/services/security/securityEvents.js'

// Called only with trusted server outcomes, never client-supplied event labels.
// A 401 or a quota denial alone is not proof of an attack.
export function securitySignalFromOutcome({ code, feature, status } = {}) {
  if (!Number.isInteger(status)) return null
  let type = null
  if (status === 429 && code === 'RATE_LIMITED') {
    type = SECURITY_EVENT_TYPES.API_RATE_LIMITED
  } else if (status === 403 && code === 'PREMIUM_ACCESS_DENIED') {
    type = SECURITY_EVENT_TYPES.PREMIUM_ACCESS_DENIED
  } else if (status === 403 && code === 'CROSS_USER_ACCESS_DENIED') {
    type = SECURITY_EVENT_TYPES.CROSS_USER_ACCESS_DENIED
  } else if (status === 403 && code === 'QUOTA_BYPASS_ATTEMPT') {
    type = SECURITY_EVENT_TYPES.QUOTA_BYPASS_ATTEMPT
  }
  return type ? classifySecurityEvent({ feature, type }) : null
}
