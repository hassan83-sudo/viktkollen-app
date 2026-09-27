import { createHash } from 'node:crypto'
import { getPlanById } from '../../../src/services/billing/planCatalog.js'
import { sumUpWidgetMountConfig } from '../../../src/services/billing/sumupWidgetMount.js'
import {
  createSumUpHttpTransport,
  minorUnitsFromSumUpAmount,
  readSumUpConfig,
  sumUpMajorFromMinor,
} from './providers/sumup.js'
import { sumUpCustomerIdForUser } from './sumupRecurring.js'

export const SANDBOX_SETUP_PLAN_ID = 'plan.prelim.sek.month.04'
const CHECKOUT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function closed(code, status) {
  return { accessGranted: false, code, ok: false, status }
}

function catalogPrice() {
  const plan = getPlanById(SANDBOX_SETUP_PLAN_ID)
  if (!plan || plan.currency !== 'SEK' || plan.active !== true || plan.price_minor !== 400) return null
  const amount = sumUpMajorFromMinor(plan.price_minor)
  if (amount !== 4) return null
  return { amount, minor: 400 }
}

function setupReference(userId) {
  return `sb${createHash('sha256').update(`${userId}|${SANDBOX_SETUP_PLAN_ID}|setup`).digest('hex').slice(0, 40)}`
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

/**
 * Sandbox-only 4 SEK recurring setup. Proves the merchant is a SumUp sandbox
 * before any checkout is created. Does not grant access and ignores any
 * client amount or currency.
 */
export async function prepareSumUpSandboxSetup({
  clientAmount,
  clientCurrency,
  env = process.env,
  transport,
  userId,
} = {}) {
  void clientAmount
  void clientCurrency
  const priced = catalogPrice()
  const customerId = sumUpCustomerIdForUser(userId)
  if (!priced || !customerId) return closed('INVALID_PLAN', 400)

  const config = readSumUpConfig(env)
  if (!config) return closed('SANDBOX_NOT_CONFIGURED', 503)
  const http = transport || createSumUpHttpTransport({ apiKey: config.apiKey })
  if (typeof http.retrieveMerchant !== 'function' || typeof http.createCheckout !== 'function') {
    return closed('SANDBOX_NOT_CONFIGURED', 503)
  }

  let merchant
  try {
    merchant = await http.retrieveMerchant(config.merchantCode)
  } catch {
    return closed('SANDBOX_IDENTITY_REQUIRED', 403)
  }
  if (merchant?.sandbox !== true || merchant?.merchant_code !== config.merchantCode) {
    return closed('SANDBOX_IDENTITY_REQUIRED', 403)
  }

  const reference = setupReference(userId)
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
      if (error?.code !== 'SUMUP_REFERENCE_EXISTS') return closed('SUMUP_CHECKOUT_FAILED', 502)
      created = await singleCheckout(http, reference)
    }
    const checkout = created?.id ? await http.retrieveCheckout(created.id) : null
    if (!acceptedCheckout(checkout, {
      customerId,
      merchantCode: config.merchantCode,
      priced,
      reference,
    })) {
      return closed('SUMUP_CHECKOUT_FAILED', 502)
    }
    const widget = sumUpWidgetMountConfig({ checkoutId: checkout.id })
    if (!widget || checkout.status !== 'PENDING') {
      return {
        accessGranted: false,
        amount: priced.amount,
        code: checkout.status === 'PAID' ? 'ALREADY_COMPLETED' : 'SUMUP_CHECKOUT_FAILED',
        currency: 'SEK',
        ok: false,
        status: checkout.status === 'PAID' ? 409 : 502,
      }
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
    return closed('SUMUP_CHECKOUT_FAILED', 502)
  }
}
