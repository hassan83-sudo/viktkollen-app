import { getPlanById } from '../../../src/services/billing/planCatalog.js'
import { sumUpWidgetMountConfig } from '../../../src/services/billing/sumupWidgetMount.js'
import { createSupabaseAdminClient } from '../supabaseServer.js'
import {
  createSumUpHttpTransport,
  minorUnitsFromSumUpAmount,
  readSumUpConfig,
  SUMUP_PROVIDER,
  sumUpMajorFromMinor,
} from './providers/sumup.js'
import { sumUpCustomerIdForUser } from './sumupRecurring.js'
import {
  liveCheckoutEnabled,
  oneTimeCheckoutMode,
  SUMUP_CONFIRMED_LIVE_MERCHANT_CODE,
  sumUpMerchantCode,
  sumUpMerchantIdentityAccepted,
  sumUpSandboxSignal,
} from './sumupOneTimeCheckout.js'

export const SANDBOX_SETUP_PLAN_ID = 'plan.prelim.sek.month.09'
const CHECKOUT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INTENT_ID_RE = /^[A-Za-z0-9._:-]{1,80}$/
const INTENT_TTL_MS = 30 * 60 * 1000

function closed(code, status) {
  return { accessGranted: false, code, ok: false, status }
}

function catalogPrice() {
  const plan = getPlanById(SANDBOX_SETUP_PLAN_ID)
  if (!plan || plan.currency !== 'SEK' || plan.active !== true || plan.price_minor !== 900) return null
  const amount = sumUpMajorFromMinor(plan.price_minor)
  if (amount !== 9) return null
  return { amount, minor: 900 }
}

function durablePorts(ports) {
  return typeof ports?.createIntent === 'function'
    && typeof ports?.bindCheckoutRef === 'function'
    && typeof ports?.cancelIntent === 'function'
}

async function cancelQuietly(ports, checkoutId) {
  try {
    await ports.cancelIntent(checkoutId)
  } catch {
    /* A failed setup still grants no access. Expiry closes anything left pending. */
  }
}

async function createCustomer(transport, customerId) {
  try {
    await transport.createCustomer({ customer_id: customerId })
  } catch (error) {
    if (error?.code !== 'SUMUP_REFERENCE_EXISTS') throw error
  }
}

async function singleCheckout(transport, reference) {
  const listed = await transport.listCheckouts(reference)
  const rows = Array.isArray(listed) ? listed : (listed?.checkouts || listed?.items || [])
  if (rows.length !== 1) return null
  return rows[0]
}

function acceptedCheckout(checkout, { customerId, merchantCode, priced, reference }) {
  if (!CHECKOUT_ID_RE.test(String(checkout?.id || ''))) return false
  if (checkout.checkout_reference !== reference) return false
  if (checkout.purpose !== 'SETUP_RECURRING_PAYMENT') return false
  if (checkout.customer_id !== customerId) return false
  if (checkout.currency !== 'SEK') return false
  if (checkout.merchant_code !== merchantCode) return false
  if (minorUnitsFromSumUpAmount(checkout.amount) !== priced.minor) return false
  if (checkout.status !== 'PENDING' && checkout.status !== 'PAID') return false
  return true
}

function intentFromRow(data, { planId, userId }) {
  const checkoutId = String(data?.checkout_id || '')
  if (!INTENT_ID_RE.test(checkoutId)) return null
  if (data.plan_id !== planId || data.provider !== SUMUP_PROVIDER || data.status !== 'pending') return null
  if (String(data.user_id) !== userId) return null
  return {
    checkoutId,
    planId: data.plan_id,
    status: data.status,
    userId: data.user_id,
  }
}

/**
 * Durable ports for billing.create_checkout_intent, bind_provider_checkout_ref,
 * and cancel_checkout_intent. Amount and currency stay on the plan row.
 */
export function createServerCheckoutIntentPorts({ client, env = process.env } = {}) {
  const resolved = client !== undefined ? client : createSupabaseAdminClient(env)
  if (!resolved || typeof resolved.schema !== 'function') return null
  async function rpc(name, args) {
    const { data, error } = await resolved.schema('billing').rpc(name, args)
    if (error) {
      const wrapped = new Error('checkout_intent_failed')
      wrapped.code = 'checkout_intent_failed'
      throw wrapped
    }
    return data
  }
  return {
    async createIntent({ planId, provider, userId }) {
      const data = await rpc('create_checkout_intent', {
        p_expires_at: new Date(Date.now() + INTENT_TTL_MS).toISOString(),
        p_plan_id: planId,
        p_provider: provider,
        p_provider_price_ref: '',
        p_user_id: userId,
      })
      const intent = intentFromRow(data, { planId, userId })
      if (!intent) {
        const wrapped = new Error('invalid_checkout_intent')
        wrapped.code = 'invalid_checkout_intent'
        throw wrapped
      }
      return intent
    },
    async bindCheckoutRef({ checkoutId, provider, providerCheckoutRef }) {
      const data = await rpc('bind_provider_checkout_ref', {
        p_checkout_id: checkoutId,
        p_provider: provider,
        p_provider_checkout_ref: providerCheckoutRef,
      })
      if (data?.checkout_id !== checkoutId
        || data?.provider !== provider
        || data?.provider_checkout_ref !== providerCheckoutRef
        || data?.status !== 'pending') {
        const wrapped = new Error('provider_checkout_mismatch')
        wrapped.code = 'provider_checkout_mismatch'
        throw wrapped
      }
      return data
    },
    async cancelIntent(checkoutId) {
      const data = await rpc('cancel_checkout_intent', { p_checkout_id: checkoutId })
      if (data?.status !== 'cancelled' && data?.status !== 'expired') {
        const wrapped = new Error('checkout_intent_failed')
        wrapped.code = 'checkout_intent_failed'
        throw wrapped
      }
      return data
    },
  }
}

async function liveSetupAllowed({ env, isBillingAdmin, merchant, merchantCode, transport, userId }) {
  if (!liveCheckoutEnabled(env)) return { ok: false, code: 'SANDBOX_IDENTITY_REQUIRED', status: 403 }
  const identity = oneTimeCheckoutMode(env)
  if (!identity.ok || identity.mode !== 'live') {
    return { ok: false, code: 'LIVE_IDENTITY_REQUIRED', status: 403 }
  }
  let admin = false
  if (typeof isBillingAdmin === 'function') {
    try {
      admin = await isBillingAdmin(userId) === true
    } catch {
      admin = false
    }
  }
  if (!admin) return { ok: false, code: 'LIVE_ADMIN_REQUIRED', status: 403 }
  let account = null
  const confirmedOmission = sumUpSandboxSignal(merchant) === 'absent'
    && sumUpMerchantCode(merchant) === SUMUP_CONFIRMED_LIVE_MERCHANT_CODE
    && merchantCode === SUMUP_CONFIRMED_LIVE_MERCHANT_CODE
  if (confirmedOmission && typeof transport.retrieveCurrentMerchant === 'function') {
    try {
      account = await transport.retrieveCurrentMerchant()
    } catch {
      account = null
    }
  }
  if (!sumUpMerchantIdentityAccepted({
    account,
    configuredCode: merchantCode,
    merchant,
    mode: 'live',
  })) {
    return { ok: false, code: 'LIVE_IDENTITY_REQUIRED', status: 403 }
  }
  return { ok: true }
}

/**
 * 9 SEK billing-admin recurring setup. The ordinary 4 SEK plan is unchanged.
 * The sandbox branch requires a SumUp sandbox merchant.
 * The live branch is separate: it requires the live env flag, the production
 * Supabase project, a verified production merchant, and a server-side
 * billing_admin check. Client amount, currency, and admin flags are ignored.
 * The checkout reuses SETUP_RECURRING_PAYMENT and does not grant access.
 */
export async function prepareSumUpSandboxSetup({
  billingAdmin,
  clientAmount,
  clientCurrency,
  env = process.env,
  isBillingAdmin,
  live,
  ports,
  transport,
  userId,
} = {}) {
  void billingAdmin
  void clientAmount
  void clientCurrency
  void live
  const priced = catalogPrice()
  const customerId = sumUpCustomerIdForUser(userId)
  if (!priced || !customerId) return closed('INVALID_PLAN', 400)

  const config = readSumUpConfig(env)
  if (!config) return closed('SANDBOX_NOT_CONFIGURED', 503)
  const http = transport || createSumUpHttpTransport({ apiKey: config.apiKey })
  if (typeof http.retrieveMerchant !== 'function' || typeof http.createCheckout !== 'function') {
    return closed('SANDBOX_NOT_CONFIGURED', 503)
  }
  if (!durablePorts(ports)) return closed('DURABLE_UNAVAILABLE', 503)

  let merchant
  try {
    merchant = await http.retrieveMerchant(config.merchantCode)
  } catch {
    return closed('SANDBOX_IDENTITY_REQUIRED', 403)
  }
  const sandboxMerchant = merchant?.sandbox === true && merchant?.merchant_code === config.merchantCode
  if (!sandboxMerchant) {
    const liveGate = await liveSetupAllowed({
      env,
      isBillingAdmin,
      merchant,
      merchantCode: config.merchantCode,
      transport: http,
      userId,
    })
    if (!liveGate.ok) return closed(liveGate.code, liveGate.status)
  }

  let intent
  try {
    intent = await ports.createIntent({
      planId: SANDBOX_SETUP_PLAN_ID,
      provider: SUMUP_PROVIDER,
      userId,
    })
  } catch {
    return closed('SUMUP_CHECKOUT_FAILED', 502)
  }
  const reference = String(intent?.checkoutId || '')
  if (!INTENT_ID_RE.test(reference)
    || (intent.planId && intent.planId !== SANDBOX_SETUP_PLAN_ID)
    || (intent.userId && String(intent.userId) !== userId)
    || (intent.status && intent.status !== 'pending')) {
    if (INTENT_ID_RE.test(reference)) await cancelQuietly(ports, reference)
    return closed('SUMUP_CHECKOUT_FAILED', 502)
  }

  try {
    await createCustomer(http, customerId)
    let created
    try {
      created = await http.createCheckout({
        amount: priced.amount,
        checkout_reference: reference,
        currency: 'SEK',
        customer_id: customerId,
        description: 'Viktkollen',
        merchant_code: config.merchantCode,
        purpose: 'SETUP_RECURRING_PAYMENT',
      })
    } catch (error) {
      if (error?.code !== 'SUMUP_REFERENCE_EXISTS') throw error
      created = await singleCheckout(http, reference)
    }
    const checkout = created?.id ? await http.retrieveCheckout(created.id) : null
    if (!acceptedCheckout(checkout, {
      customerId,
      merchantCode: config.merchantCode,
      priced,
      reference,
    })) {
      await cancelQuietly(ports, reference)
      return closed('SUMUP_CHECKOUT_FAILED', 502)
    }
    await ports.bindCheckoutRef({
      checkoutId: reference,
      provider: SUMUP_PROVIDER,
      providerCheckoutRef: checkout.id,
    })
    if (checkout.status !== 'PENDING') {
      return {
        accessGranted: false,
        amount: priced.amount,
        code: checkout.status === 'PAID' ? 'ALREADY_COMPLETED' : 'SUMUP_CHECKOUT_FAILED',
        currency: 'SEK',
        ok: false,
        status: checkout.status === 'PAID' ? 409 : 502,
      }
    }
    const widget = sumUpWidgetMountConfig({ checkoutId: checkout.id })
    if (!widget) {
      await cancelQuietly(ports, reference)
      return closed('SUMUP_CHECKOUT_FAILED', 502)
    }
    return {
      accessGranted: false,
      amount: priced.amount,
      checkoutId: checkout.id,
      currency: 'SEK',
      ok: true,
      purpose: 'SETUP_RECURRING_PAYMENT',
      status: 200,
    }
  } catch {
    await cancelQuietly(ports, reference)
    return closed('SUMUP_CHECKOUT_FAILED', 502)
  }
}
