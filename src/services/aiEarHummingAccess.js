import { getCurrentAiAuthorization } from './ai/aiAuthTransport.js'

/**
 * Humma / sjung is owner-only during the test period. The client asks the
 * server whether this session is a billing admin and fails closed on any
 * problem. This only decides whether the recorder is shown: the humming
 * route checks the owner again on every request.
 */
export async function loadAiEarHummingAccess({ fetchImpl = globalThis.fetch, signal } = {}) {
  try {
    const auth = await getCurrentAiAuthorization()
    if (!auth.ok) return false
    const response = await fetchImpl('/api/billing/capability', { headers: { Authorization: auth.authorizationHeader }, method: 'GET', signal })
    const payload = await response.json().catch(() => ({}))
    return response.ok && payload?.billing_admin === true
  } catch {
    return false
  }
}
