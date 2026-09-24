import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../../_shared/aiRouteErrors.js'
import { inspectServerQuota } from '../../_shared/billing/quota.js'
import { getServerSubscription } from '../../_shared/billing/subscription.js'
import { lookupBillingAdmin } from '../../_shared/billing/admin.js'
import { readPlanComparison } from '../../_shared/billing/planComparisonRead.js'
import { readUsageSnapshot } from '../../_shared/billing/usageSnapshotRead.js'
import { verifySupabaseUser } from '../../_shared/verifySupabaseUser.js'

function legacyCompatibilityEntitlement(userId) {
  return {
    cancelAt: '',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: '',
    currentPeriodStart: '',
    featureOverrides: {},
    plan: 'free',
    provider: 'none',
    providerCustomerId: '',
    providerSubscriptionId: '',
    source: 'legacy-compatibility',
    status: 'none',
    syncedAt: '',
    userId: String(userId || ''),
    version: 1,
  }
}

const PUBLIC_OPS = Object.freeze({
  '/api/billing/quota': 'quota',
  '/api/billing/subscription': 'subscription',
  '/api/billing/plans': 'plans',
  '/api/billing/usage': 'usage',
  '/api/billing/capability': 'capability',
  '/api/entitlements': 'entitlements',
})

const INTERNAL_OPS = Object.freeze(['quota', 'subscription', 'entitlements', 'plans', 'usage', 'capability'])

function header(request, name) {
  const headers = request?.headers || {}
  return headers[name] || headers[name.toLowerCase()] || ''
}

function pathnameOf(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return new URL(raw).pathname
    }
  } catch {
    return raw.split('?')[0]
  }
  return raw.split('?')[0]
}

function normalizePath(path) {
  const trimmed = String(path || '').replace(/\/+$/, '')
  return trimmed || '/'
}

/**
 * Public paths win. Rewrite-only internal path may use allowlisted __vk_route.
 * Client query `op` / `route` / function names are ignored.
 */
export function resolveUserBillingOperation(request = {}) {
  const hints = [
    request.url,
    header(request, 'x-invoke-path'),
    header(request, 'x-matched-path'),
    header(request, 'x-original-uri'),
    header(request, 'x-forwarded-uri'),
  ]
  for (const hint of hints) {
    const path = normalizePath(pathnameOf(hint))
    if (PUBLIC_OPS[path]) return PUBLIC_OPS[path]
  }

  const path = normalizePath(pathnameOf(request.url || header(request, 'x-invoke-path')))
  if (path === '/api/billing/user') {
    const routed = String(request.query?.__vk_route || '').trim()
    if (INTERNAL_OPS.includes(routed)) return routed
  }
  return null
}

async function handleQuota(request, response, auth, requestId) {
  const feature = typeof request.query?.feature === 'string' ? request.query.feature : ''
  const unit = typeof request.query?.unit === 'string' ? request.query.unit : undefined
  const quota = await inspectServerQuota({
    feature,
    unit,
    user: auth.user,
  })
  return response.status(200).json({
    ok: true,
    quota,
    requestId,
  })
}

async function handleSubscription(request, response, auth, requestId) {
  const queryUser = typeof request.query?.user_id === 'string' ? request.query.user_id : ''
  if (queryUser && queryUser !== auth.user.id) {
    return response.status(403).json({
      error: { code: 'FORBIDDEN_USER' },
      ok: false,
      requestId,
    })
  }
  const subscription = await getServerSubscription({ user: auth.user })
  return response.status(200).json({
    ok: true,
    requestId,
    subscription,
  })
}

async function handleUsage(request, response, auth, requestId) {
  void request.query?.plan
  void request.query?.price
  void request.query?.quota
  void request.query?.remaining
  void request.query?.usage
  void request.query?.user_id
  const snapshot = await readUsageSnapshot(auth.user.id)
  if (!snapshot) {
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.PROVIDER_UNAVAILABLE,
      requestId,
      retryable: true,
      safeMessage: 'Abonnemanget kunde inte hämtas just nu.',
      status: 503,
    })
  }
  return response.status(200).json({
    ok: true,
    requestId,
    snapshot,
  })
}

async function handlePlans(request, response, auth, requestId) {
  void request.query?.enabled_for_sale
  void request.query?.forSale
  void request.query?.plan
  void request.query?.plan_id
  void request.query?.price
  void request.query?.user_id
  const comparison = await readPlanComparison(auth.user.id)
  if (!comparison) {
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.PROVIDER_UNAVAILABLE,
      requestId,
      retryable: true,
      safeMessage: 'Jämförelsen kunde inte hämtas just nu.',
      status: 503,
    })
  }
  return response.status(200).json({
    comparison,
    ok: true,
    requestId,
  })
}

async function handleCapability(request, response, auth, requestId) {
  void request.query?.billing_admin
  void request.query?.isAdmin
  void request.query?.role
  return response.status(200).json({
    billing_admin: await lookupBillingAdmin(auth.user.id),
    ok: true,
    requestId,
  })
}

async function handleEntitlements(request, response, auth, requestId) {
  void request.query?.user_id
  void request.query?.plan
  return response.status(200).json({
    authority: 'none',
    compatibility: true,
    entitlement: legacyCompatibilityEntitlement(auth.user.id),
    ok: true,
    requestId,
    verification: 'legacy_compatibility_not_authority',
  })
}

export default async function handler(request, response) {
  const requestId = `bill-user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  setNoStoreHeaders(response)

  void request.query?.isAdmin
  void request.query?.role
  void request.query?.op
  void request.body

  const operation = resolveUserBillingOperation(request)
  if (!operation) {
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Okänd sökväg.',
      status: 404,
    })
  }

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Endast GET stöds.',
      status: 405,
    })
  }

  const auth = await verifySupabaseUser(request, { requestId })
  if (!auth.authenticated) {
    return response.status(auth.status).json({
      error: auth.error,
      ok: false,
    })
  }

  if (operation === 'quota') return handleQuota(request, response, auth, requestId)
  if (operation === 'subscription') return handleSubscription(request, response, auth, requestId)
  if (operation === 'entitlements') return handleEntitlements(request, response, auth, requestId)
  if (operation === 'plans') return handlePlans(request, response, auth, requestId)
  if (operation === 'usage') return handleUsage(request, response, auth, requestId)
  if (operation === 'capability') return handleCapability(request, response, auth, requestId)

  return sendSafeAiError(response, {
    code: aiRouteErrorCodes.INVALID_REQUEST,
    requestId,
    safeMessage: 'Okänd sökväg.',
    status: 404,
  })
}

export const entitlementRouteInternals = {
  verification: 'legacy_compatibility_not_authority',
}
