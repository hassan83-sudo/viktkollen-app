import { lookupBillingAdmin } from './billing/admin.js'
import { aiRouteErrorCodes, sendSafeAiError } from './aiRouteErrors.js'

/**
 * Funktionsspärr i servern. Avgör per funktion om en inloggad användare får
 * starta den. Samma svar används av API-rutterna (som nekar) och av
 * /api/billing/capability (som appen visar låset utifrån), så klient och
 * server kan inte vara oense.
 *
 * - 'admin_only': bara ett verifierat billing_admin-konto. Rollen läses i
 *   servern (billing.has_billing_admin) vid varje anrop. Om den inte kan
 *   verifieras nekas åtkomsten.
 * - 'open': alla inloggade.
 *
 * Varje funktion kan öppnas separat med miljövariabeln i FEATURE_ACCESS_ENV
 * satt till exakt 'open'. Alla andra värden, och saknad variabel, ger
 * policyns läge. Spärren raderar eller ändrar ingen data.
 *
 * Bara AI-örat är inkopplat.
 */
export const FEATURE_ACCESS_POLICY = Object.freeze({
  aiEar: 'admin_only',
})

export const FEATURE_ACCESS_ENV = Object.freeze({
  aiEar: 'FEATURE_ACCESS_AI_EAR',
})

export const FEATURE_ACCESS = Object.freeze({
  ALLOWED: 'allowed',
  LOCKED: 'locked',
})

export function featureAccessMode(featureKey, env = process.env) {
  const policy = FEATURE_ACCESS_POLICY[featureKey]
  if (!policy) return 'open'
  const override = String(env?.[FEATURE_ACCESS_ENV[featureKey]] || '').trim()
  return override === 'open' ? 'open' : policy
}

/**
 * @returns {Promise<{ allowed: boolean, reason: 'open' | 'admin' | 'not_admin' | 'unverified' }>}
 */
export async function checkFeatureAccess(featureKey, userId, { env = process.env, lookupAdmin = lookupBillingAdmin } = {}) {
  if (featureAccessMode(featureKey, env) === 'open') return { allowed: true, reason: 'open' }
  if (!userId) return { allowed: false, reason: 'unverified' }
  let isAdmin
  try {
    isAdmin = await lookupAdmin(userId)
  } catch {
    return { allowed: false, reason: 'unverified' }
  }
  return isAdmin === true ? { allowed: true, reason: 'admin' } : { allowed: false, reason: 'not_admin' }
}

/** Access for every policed feature, for the capability response. */
export async function listFeatureAccess(userId, options = {}) {
  const entries = await Promise.all(Object.keys(FEATURE_ACCESS_POLICY).map(async (featureKey) => {
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
