import { lookupBillingAdmin } from './billing/admin.js'
import { aiRouteErrorCodes, sendSafeAiError } from './aiRouteErrors.js'

/**
 * Funktionsspärr i servern. Ett enda beslut per funktion och användare, som
 * används både av API-rutterna (som nekar) och av /api/billing/capability
 * (som appen visar låset utifrån). Klient och server kan därför inte vara oense.
 *
 * Styrning (bara i servern, via miljövariabler):
 * - Huvudbrytare FEATURE_RESTRICTIONS: exakt 'off' stänger av hela
 *   begränsningen, så att alla funktioner beter sig som före spärren och bara
 *   deras befintliga säkerhetsspärrar gäller. Alla andra värden, och saknad
 *   variabel, betyder på.
 * - Lista FEATURE_RESTRICTIONS_LOCKED: kommaseparerade funktionsnycklar som är
 *   spärrade medan huvudbrytaren är på. Saknas variabeln gäller
 *   DEFAULT_LOCKED_FEATURES. Bara nycklar i RESTRICTABLE_FEATURES räknas;
 *   okända nycklar ignoreras. En tom lista spärrar ingenting.
 *
 * En spärrad funktion får bara användas av ett verifierat billing_admin-konto.
 * Rollen läses i servern (billing.has_billing_admin) vid varje anrop; kan den
 * inte verifieras nekas åtkomsten. Spärren raderar eller ändrar ingen data.
 *
 * Bara AI-örat är inkopplat. En ny funktion kopplas in genom att dess nyckel
 * läggs i RESTRICTABLE_FEATURES och dess rutter anropar checkFeatureAccess.
 */
export const RESTRICTABLE_FEATURES = Object.freeze(['aiEar'])
export const DEFAULT_LOCKED_FEATURES = Object.freeze(['aiEar'])

export const FEATURE_ACCESS = Object.freeze({
  ALLOWED: 'allowed',
  LOCKED: 'locked',
})

/** The server's restriction settings: { enabled, locked: string[] }. */
export function readFeatureRestrictions(env = process.env) {
  const enabled = String(env?.FEATURE_RESTRICTIONS ?? '').trim() !== 'off'
  const raw = env?.FEATURE_RESTRICTIONS_LOCKED
  const requested = raw == null ? DEFAULT_LOCKED_FEATURES : String(raw).split(',').map((key) => key.trim())
  const locked = RESTRICTABLE_FEATURES.filter((key) => requested.includes(key))
  return { enabled, locked }
}

export function isFeatureRestricted(featureKey, env = process.env) {
  const { enabled, locked } = readFeatureRestrictions(env)
  return enabled && locked.includes(featureKey)
}

/**
 * @returns {Promise<{ allowed: boolean, reason: 'open' | 'admin' | 'not_admin' | 'unverified' }>}
 */
export async function checkFeatureAccess(featureKey, userId, { env = process.env, lookupAdmin = lookupBillingAdmin } = {}) {
  if (!isFeatureRestricted(featureKey, env)) return { allowed: true, reason: 'open' }
  if (!userId) return { allowed: false, reason: 'unverified' }
  let isAdmin
  try {
    isAdmin = await lookupAdmin(userId)
  } catch {
    return { allowed: false, reason: 'unverified' }
  }
  return isAdmin === true ? { allowed: true, reason: 'admin' } : { allowed: false, reason: 'not_admin' }
}

/** Access for every restrictable feature, for the capability response. */
export async function listFeatureAccess(userId, options = {}) {
  const entries = await Promise.all(RESTRICTABLE_FEATURES.map(async (featureKey) => {
    const { allowed } = await checkFeatureAccess(featureKey, userId, options)
    return [featureKey, allowed ? FEATURE_ACCESS.ALLOWED : FEATURE_ACCESS.LOCKED]
  }))
  return Object.fromEntries(entries)
}

export function sendFeatureLocked(response, requestId) {
  return sendSafeAiError(response, {
    code: aiRouteErrorCodes.FEATURE_LOCKED,
    requestId,
    retryable: false,
    status: 403,
  })
}
