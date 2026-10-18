// Security Center #38: deterministic, privacy-minimizing security event classification.
// This module does not accept browser-supplied event severity as authoritative.
export const SECURITY_EVENT_TYPES = Object.freeze({
  AUTH_FAILURE_BURST: 'AUTH_FAILURE_BURST',
  QUOTA_BYPASS_ATTEMPT: 'QUOTA_BYPASS_ATTEMPT',
  PREMIUM_ACCESS_DENIED: 'PREMIUM_ACCESS_DENIED',
  BILLING_TAMPER_ATTEMPT: 'BILLING_TAMPER_ATTEMPT',
  CROSS_USER_ACCESS_DENIED: 'CROSS_USER_ACCESS_DENIED',
  AI_USAGE_SPIKE: 'AI_USAGE_SPIKE',
  API_RATE_LIMITED: 'API_RATE_LIMITED',
  MONITORING_UNAVAILABLE: 'MONITORING_UNAVAILABLE',
  ADMIN_ACCESS_DENIED: 'ADMIN_ACCESS_DENIED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
})

const SEVERITY = Object.freeze({
  AUTH_FAILURE_BURST: 'medium',
  QUOTA_BYPASS_ATTEMPT: 'high',
  PREMIUM_ACCESS_DENIED: 'medium',
  BILLING_TAMPER_ATTEMPT: 'high',
  CROSS_USER_ACCESS_DENIED: 'critical',
  AI_USAGE_SPIKE: 'high',
  API_RATE_LIMITED: 'medium',
  MONITORING_UNAVAILABLE: 'critical',
  ADMIN_ACCESS_DENIED: 'high',
  QUOTA_EXCEEDED: 'medium',
})

/**
 * Accept ONLY trusted server-side events; the caller must authenticate its source.
 * Never attach body content, image data, email, tokens, passwords or IP addresses.
 */
export function classifySecurityEvent(event = {}) {
  if (!event || !Object.hasOwn(SEVERITY, event.type)) return null
  const count = Number(event.count)
  const timestamp = typeof event.timestamp === 'string' && !Number.isNaN(Date.parse(event.timestamp))
    ? new Date(event.timestamp).toISOString()
    : new Date().toISOString()
  return Object.freeze({
    type: event.type,
    severity: SEVERITY[event.type],
    timestamp,
    count: Number.isSafeInteger(count) && count >= 0 ? count : 1,
    feature: typeof event.feature === 'string' && /^[a-z0-9_-]{1,48}$/i.test(event.feature)
      ? event.feature : 'unknown',
    status: 'open',
  })
}

export function summarizeSecurityEvents(events = []) {
  const summary = { critical: 0, high: 0, medium: 0, total: 0 }
  for (const event of events) {
    const classified = classifySecurityEvent(event)
    if (!classified) continue
    summary[classified.severity]++
    summary.total++
  }
  return summary
}
