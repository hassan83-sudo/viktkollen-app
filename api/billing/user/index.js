import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../../_shared/aiRouteErrors.js'
import { readDurableQuota } from '../../_shared/billing/quotaRead.js'
import { readDurableUserSubscription } from '../../_shared/billing/subscriptionRead.js'
import { handleCheckoutRequest, handleCheckoutStatusRequest } from '../../_shared/billing/checkoutIntent.js'
import { createServerCheckoutIntentPorts, prepareSumUpSandboxSetup } from '../../_shared/billing/sumupSandboxSetup.js'
import { handleWebhookRequest } from '../../_shared/billing/providerWebhookIngress.js'
import { executeUserBillingIntent } from '../../_shared/billing/userLifecycleIntent.js'
import { lookupBillingAdmin, requireBillingAdmin } from '../../_shared/billing/admin.js'
import { getConfiguredSumUpAdapter } from '../../_shared/billing/providers/sumup.js'
import { readPlanComparison } from '../../_shared/billing/planComparisonRead.js'
import { readUsageSnapshot } from '../../_shared/billing/usageSnapshotRead.js'
import { applyOwnerFoodScanStatus, resolveFoodScanOwnerStatus } from '../../_shared/billing/foodScanOwnerExemption.js'
import {
  applyOwnerBodyScanQuota,
  applyOwnerBodyScanStatus,
  resolveBodyScanOwnerStatus,
} from '../../_shared/billing/bodyScanOwnerExemption.js'
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

const POST_OPS = Object.freeze({
  '/api/billing/plan-change': 'plan_change',
  '/api/billing/checkout': 'checkout',
  '/api/billing/checkout/status': 'checkout_status',
  '/api/billing/sumup-sandbox': 'sumup_sandbox',
  '/api/billing/cancel': 'schedule_cancel',
  '/api/billing/cancel-undo': 'undo_cancel',
})

const INTERNAL_OPS = Object.freeze(['quota', 'subscription', 'entitlements', 'plans', 'usage', 'capability', 'sumup_live_check'])

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

function requestPaths(request) {
  const hints = [
    request.url,
    header(request, 'x-invoke-path'),
    header(request, 'x-matched-path'),
    header(request, 'x-original-uri'),
    header(request, 'x-forwarded-uri'),
  ]
  return hints.map((hint) => normalizePath(pathnameOf(hint))).filter(Boolean)
}

export function resolveUserBillingPost(request = {}) {
  for (const path of requestPaths(request)) {
    if (path === '/api/billing/webhook') return 'webhook'
    if (POST_OPS[path]) return POST_OPS[path]
  }
  const path = normalizePath(pathnameOf(request.url || header(request, 'x-invoke-path')))
  if (path === '/api/billing/user') {
    const routed = String(request.query?.__vk_route || '').trim()
    if (routed === 'webhook') return 'webhook'
    if (routed === 'sumup_sandbox') return 'sumup_sandbox'
    if (Object.values(POST_OPS).includes(routed)) return routed
  }
  return null
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
  void request.query?.limit
  void request.query?.plan
  void request.query?.plan_id
  void request.query?.remaining
  void request.query?.status
  void request.query?.usage
  void request.query?.used
  void request.query?.user_id
  void request.body
  const feature = typeof request.query?.feature === 'string' ? request.query.feature : ''
  const unit = typeof request.query?.unit === 'string' ? request.query.unit : undefined
  const result = await readDurableQuota({
    feature,
    unit,
    userId: auth.user.id,
  })
  if (result.unavailable) {
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.PROVIDER_UNAVAILABLE,
      requestId,
      retryable: true,
      safeMessage: 'Kvoten kunde inte hämtas just nu.',
      status: 503,
    })
  }
  // Ägarkontot (serververifierad billing_admin + aktiverad flagga) får obegränsad
  // kroppsscanning. Gäller bara body.scan; övriga funktioner visar sin riktiga kvot.
  const ownerBodyScan = result.quota?.feature === 'body.scan'
    ? await resolveBodyScanOwnerStatus({ userId: auth.user.id }).catch(() => null)
    : null
  return response.status(200).json({
    ok: true,
    quota: applyOwnerBodyScanQuota(result.quota, ownerBodyScan),
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
  void request.query?.limit
  void request.query?.plan
  void request.query?.plan_id
  void request.query?.quota
  void request.query?.status
  void request.body
  const result = await readDurableUserSubscription(auth.user.id)
  if (result.unavailable) {
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
    subscription: result.subscription,
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
  // Ägarkontot (serververifierad billing_admin + aktiverad flagga) ser
  // obegränsad matscanning i stället för månadskvoten. Övriga ser sin riktiga kvot.
  const ownerStatus = await resolveFoodScanOwnerStatus({ userId: auth.user.id }).catch(() => null)
  const ownerBodyScan = await resolveBodyScanOwnerStatus({ userId: auth.user.id }).catch(() => null)
  return response.status(200).json({
    ok: true,
    requestId,
    snapshot: applyOwnerBodyScanStatus(applyOwnerFoodScanStatus(snapshot, ownerStatus), ownerBodyScan),
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

async function handleSumUpLiveCheck(request, response, requestId) {
  // Diagnostic only: no checkout, no credentials or merchant details in responses.
  const admin = await requireBillingAdmin(request, { requestId })
  if (!admin.ok) return response.status(admin.status).json({ ok: false, error: admin.error, requestId })
  if (process.env.VERCEL_ENV !== 'production') {
    return response.status(403).json({ ok: false, code: 'PRODUCTION_ONLY', requestId })
  }
  // SumUp documents secret API keys with the sup_sk_ prefix. Detect an
  // accidentally pasted credential from another provider before making calls.
  // Never echo, log or return any part of the configured secret.
  const key = typeof process.env.SUMUP_API_KEY === 'string' ? process.env.SUMUP_API_KEY.trim() : ''
  if (key && !key.startsWith('sup_sk_')) {
    return response.status(409).json({ ok: false, code: 'SUMUP_KEY_FORMAT_INVALID', requestId })
  }
  const adapter = getConfiguredSumUpAdapter()
  if (!adapter?.merchantCode || typeof adapter.transport?.retrieveMerchant !== 'function') {
    return response.status(503).json({ ok: false, code: 'SUMUP_NOT_CONFIGURED', requestId })
  }
  try {
    const merchant = await adapter.transport.retrieveMerchant(adapter.merchantCode)
    // SumUp's /v0.1/me endpoint independently identifies the account bound
    // to this API key. Both identities must match the configured merchant.
    // Neither identity match nor an omitted sandbox field proves Live status.
    const identity = await adapter.transport.retrieveCurrentMerchant()
    const codeMatches = merchant?.merchant_code === adapter.merchantCode
      && identity?.merchant_code === adapter.merchantCode
    const sandboxKnownLive = merchant?.sandbox === false && identity?.sandbox === false
    const sandboxDetected = merchant?.sandbox === true || identity?.sandbox === true
    const code = !codeMatches
      ? 'LIVE_MERCHANT_MISMATCH'
      : sandboxDetected
        ? 'LIVE_MERCHANT_SANDBOX'
        : sandboxKnownLive
          ? 'LIVE_MERCHANT_PASS'
          : 'LIVE_MERCHANT_SANDBOX_UNSPECIFIED'
    return response.status(code === 'LIVE_MERCHANT_PASS' ? 200 : code === 'LIVE_MERCHANT_SANDBOX_UNSPECIFIED' ? 502 : 409).json({
      ok: code === 'LIVE_MERCHANT_PASS',
      code,
      requestId,
    })
  } catch {
    return response.status(502).json({ ok: false, code: 'LIVE_MERCHANT_UNVERIFIED', requestId })
  }
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

async function handleSumUpSandbox(request, response, requestId) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Endast POST stöds.',
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
  const result = await prepareSumUpSandboxSetup({
    clientAmount: request.body?.amount,
    clientCurrency: request.body?.currency,
    ports: createServerCheckoutIntentPorts(),
    userId: auth.user.id,
  })
  if (!result.ok) {
    return response.status(result.status).json({
      accessGranted: false,
      error: { code: result.code },
      ok: false,
      requestId,
    })
  }
  return response.status(200).json({
    accessGranted: false,
    amount: result.amount,
    checkoutId: result.checkoutId,
    currency: result.currency,
    ok: true,
    purpose: result.purpose,
    requestId,
  })
}

async function handleEntitlements(request, response, auth, requestId) {
  // Fixed compatibility payload. Not billing authority. Do not pass it to
  // subscription lifecycle, assignment sync, or quota reservation.
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

  const postOperation = resolveUserBillingPost(request)
  if (postOperation === 'webhook') return handleWebhookRequest(request, response)
  if (postOperation === 'checkout') return handleCheckoutRequest(request, response)
  if (postOperation === 'checkout_status') return handleCheckoutStatusRequest(request, response)
  if (postOperation === 'sumup_sandbox') return handleSumUpSandbox(request, response, requestId)
  if (postOperation) {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST')
      return sendSafeAiError(response, {
        code: aiRouteErrorCodes.INVALID_REQUEST,
        requestId,
        safeMessage: 'Endast POST stöds.',
        status: 405,
      })
    }
    const postAuth = await verifySupabaseUser(request, { requestId })
    if (!postAuth.authenticated) {
      return response.status(postAuth.status).json({
        error: postAuth.error,
        ok: false,
      })
    }
    const intent = await executeUserBillingIntent({
      action: postOperation,
      body: request.body,
      userId: postAuth.user.id,
    })
    if (!intent.ok) {
      return response.status(intent.status).json({
        error: { code: intent.code },
        ok: false,
        requestId,
      })
    }
    return response.status(200).json({
      assignment: intent.assignment,
      ok: true,
      requestId,
      subscription: intent.subscription,
    })
  }

  const operation = resolveUserBillingOperation(request)
  if (!operation) {
    return sendSafeAiError(response, {
      code: aiRouteErrorCodes.INVALID_REQUEST,
      requestId,
      safeMessage: 'Okänd sökväg.',
      status: 404,
    })
  }

  if (operation === 'sumup_live_check') {
    if (request.method !== 'GET') return response.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED', requestId })
    // Diagnostic checkpoints contain no identity, credentials, or merchant data.
    // If no checkpoint appears in runtime logs, investigate function startup/imports.
    console.info('[billing-live-check] entered')
    try {
      const result = await handleSumUpLiveCheck(request, response, requestId)
      console.info('[billing-live-check] completed', response.statusCode)
      return result
    } catch {
      console.error('[billing-live-check] unexpected_handler_failure')
      return response.status(503).json({ ok: false, code: 'LIVE_DIAGNOSTIC_INTERNAL_ERROR', requestId })
    }
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
