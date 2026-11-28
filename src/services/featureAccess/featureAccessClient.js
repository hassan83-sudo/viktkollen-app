import { getCurrentAiAuthorization, hasSameAiAuthUser } from '../ai/aiAuthTransport.js'

export async function loadSubscriptionAccess() {
  try {
    const auth = await getCurrentAiAuthorization()
    if (!auth.ok) return 'locked'
    const response = await fetch('/api/billing/subscription', { headers: { Authorization: auth.authorizationHeader } })
    const payload = await response.json()
    if (!response.ok || payload?.accessGranted !== true || !await hasSameAiAuthUser(auth.userScope)) return 'locked'
    const subscription = payload.subscription
    return {
      state: 'allowed',
      expiresAt: subscription.status === 'PAST_DUE'
        ? Math.min(Date.parse(subscription.current_period_end), Date.parse(subscription.past_due_grace_until))
        : Date.parse(subscription.current_period_end),
    }
  } catch {
    return 'locked'
  }
}

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
