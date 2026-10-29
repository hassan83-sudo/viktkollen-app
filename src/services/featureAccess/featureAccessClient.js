import { getCurrentAiAuthorization } from '../ai/aiAuthTransport.js'

// Frågar servern om den inloggade användaren får starta en spärrad funktion.
// Svaret kommer från samma serverregel som API-rutterna använder
// (api/_shared/featureAccess.js). Allt annat än ett uttryckligt 'allowed'
// från servern ger 'locked', även fel, utloggning och äldre serversvar.
export async function loadFeatureAccess(featureKey, { fetchImpl = globalThis.fetch, signal } = {}) {
  try {
    const auth = await getCurrentAiAuthorization()
    if (!auth.ok) return 'locked'
    const response = await fetchImpl('/api/billing/capability', {
      headers: { Authorization: auth.authorizationHeader },
      method: 'GET',
      signal,
    })
    const payload = await response.json().catch(() => null)
    return response.ok && payload?.features?.[featureKey] === 'allowed' ? 'allowed' : 'locked'
  } catch {
    return 'locked'
  }
}
