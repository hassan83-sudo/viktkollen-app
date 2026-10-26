import { getCurrentAiAuthorization, hasSameAiAuthUser } from '../../services/ai/aiAuthTransport.js'

// Svarar alltid { ok: true, ... } eller { ok: false, code }. Kastar aldrig.
export async function requestTestFeedback({ admin = false, body = null, fetchImpl = globalThis.fetch } = {}) {
  try {
    const auth = await getCurrentAiAuthorization()
    if (!auth.ok) return { ok: false, code: auth.errorCode || 'AUTH_REQUIRED' }
    const response = await fetchImpl(`/api/test-feedback${admin ? '?resource=admin' : ''}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: auth.authorizationHeader, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    })
    const payload = await response.json().catch(() => null)
    if (!await hasSameAiAuthUser(auth.userScope)) return { ok: false, code: 'AUTH_STALE' }
    return response.ok && payload?.ok ? payload : { ok: false, code: payload?.error?.code || 'FEEDBACK_UNAVAILABLE' }
  } catch {
    return { ok: false, code: 'FEEDBACK_UNAVAILABLE' }
  }
}

export function submitTestFeedback(report, options) {
  return requestTestFeedback({ ...options, body: report })
}

export function listTestFeedback(options) {
  return requestTestFeedback({ ...options, admin: true })
}

export function updateTestFeedback(update, options) {
  return requestTestFeedback({ ...options, admin: true, body: update })
}
