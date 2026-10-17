import { getCurrentAiAuthorization, hasSameAiAuthUser } from '../../services/ai/aiAuthTransport.js'

export async function requestSupport({ admin = false, command = null } = {}) {
  try {
    const auth = await getCurrentAiAuthorization()
    if (!auth.ok) return { ok: false, code: auth.errorCode || 'AUTH_REQUIRED' }
    const response = await fetch(`/api/support${admin ? '?resource=admin' : ''}`, {
      method: command ? 'POST' : 'GET',
      headers: { Authorization: auth.authorizationHeader, ...(command ? { 'Content-Type': 'application/json' } : {}) },
      ...(command ? { body: JSON.stringify(command) } : {}),
      signal: AbortSignal.timeout(15000),
    })
    const payload = await response.json().catch(() => null)
    if (!await hasSameAiAuthUser(auth.userScope)) return { ok: false, code: 'AUTH_STALE' }
    return response.ok && payload?.ok ? payload : { ok: false, code: payload?.error?.code || 'SUPPORT_UNAVAILABLE' }
  } catch { return { ok: false, code: 'SUPPORT_UNAVAILABLE' } }
}
