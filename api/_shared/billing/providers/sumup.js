import { getPlanById } from '../../../../src/services/billing/planCatalog.js'

export const SUMUP_PROVIDER = 'sumup'
const API_BASE = 'https://api.sumup.com'
const CHECKOUT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN_RE = /^[A-Za-z0-9._:-]{1,120}$/

/**
 * Official SumUp checkout contract used by this adapter:
 * POST/GET https://api.sumup.com/v0.1/checkouts
 * Authorization: Bearer API key
 * amount is a major-unit decimal (4 SEK is 4, not 400)
 * currency includes SEK
 * checkout status PAID is the only paid state
 * checkout webhook CHECKOUT_STATUS_CHANGED is a trigger; the checkout
 * must be retrieved before it can authorize anything
 * SumUp has no subscription resource. Recurring charges use a customer
 * and a tokenized payment instrument, which this adapter does not store.
 */

export function readSumUpConfig(env = {}) {
  const apiKey = typeof env.SUMUP_API_KEY === 'string' ? env.SUMUP_API_KEY.trim() : ''
  const merchantCode = typeof env.SUMUP_MERCHANT_CODE === 'string' ? env.SUMUP_MERCHANT_CODE.trim() : ''
  if (!apiKey || !merchantCode || /\s/.test(apiKey) || !/^[A-Za-z0-9]{5,32}$/.test(merchantCode)) return null
  return { apiKey, merchantCode }
}

export function getConfiguredSumUpAdapter(env = process.env) {
  const config = readSumUpConfig(env)
  if (!config) return null
  return createSumUpCheckoutAdapter({
    merchantCode: config.merchantCode,
    transport: createSumUpHttpTransport(config),
  })
}

export function minorUnitsFromSumUpAmount(amount) {
  if (typeof amount === 'string') {
    if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(amount)) return null
    const [whole, fraction = ''] = amount.split('.')
    return (Number(whole) * 100) + Number(fraction.padEnd(2, '0'))
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null
  const minor = Math.round(amount * 100)
  if (Math.abs((amount * 100) - minor) > 1e-6) return null
  return minor
}

export function sumUpMajorFromMinor(minor) {
  if (!Number.isInteger(minor) || minor <= 0 || minor > 100_000_000) return null
  const text = `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, '0')}`
  const amount = Number(text)
  if (!Number.isFinite(amount) || amount.toFixed(2) !== text) return null
  if (minorUnitsFromSumUpAmount(amount) !== minor) return null
  return amount
}

export function isSumUpCheckoutNotification(rawBody) {
  const parsed = parseJson(rawBody)
  return Boolean(parsed && parsed.event_type === 'CHECKOUT_STATUS_CHANGED' && typeof parsed.id === 'string')
}

export function createSumUpHttpTransport({ apiKey, fetchImpl = globalThis.fetch, baseUrl = API_BASE } = {}) {
  async function request(path, { method, body } = {}) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      body: body == null ? undefined : JSON.stringify(body),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      method,
    })
    if (!response?.ok) {
      const error = new Error('sumup_http_failed')
      error.code = response?.status === 409 ? 'SUMUP_REFERENCE_EXISTS' : 'SUMUP_UNAVAILABLE'
      throw error
    }
    return response.json()
  }

  return {
    async createCheckout(body) {
      return request('/v0.1/checkouts', { body, method: 'POST' })
    },
    async createCustomer(body) {
      return request('/v0.1/customers', { body, method: 'POST' })
    },
    async listCheckouts(checkoutReference) {
      const reference = encodeURIComponent(String(checkoutReference || ''))
      return request(`/v0.1/checkouts?checkout_reference=${reference}`, { method: 'GET' })
    },
    async listPaymentInstruments(customerId) {
      return request(`/v0.1/customers/${encodeURIComponent(customerId)}/payment-instruments`, { method: 'GET' })
    },
    async retrieveMerchant(merchantCode) {
      if (!/^[A-Za-z0-9]{5,32}$/.test(String(merchantCode || ''))) {
        const error = new Error('invalid_sumup_merchant')
        error.code = 'SUMUP_UNAVAILABLE'
        throw error
      }
      return request(`/v1/merchants/${merchantCode}`, { method: 'GET' })
    },
    async processCheckout(checkoutId, body) {
      if (!CHECKOUT_ID_RE.test(String(checkoutId || ''))) {
        const error = new Error('invalid_sumup_checkout')
        error.code = 'INVALID_PROVIDER_EVENT'
        throw error
      }
      return request(`/v0.1/checkouts/${checkoutId}`, { body, method: 'PUT' })
    },
    async retrieveCheckout(checkoutId) {
      if (!CHECKOUT_ID_RE.test(String(checkoutId || ''))) {
        const error = new Error('invalid_sumup_checkout')
        error.code = 'INVALID_PROVIDER_EVENT'
        throw error
      }
      return request(`/v0.1/checkouts/${checkoutId}`, { method: 'GET' })
    },
  }
}

export function createSumUpCheckoutAdapter({
  catalog,
  intents = null,
  merchantCode,
  testOnly = false,
  transport,
} = {}) {
  if (!transport?.createCheckout || !transport?.retrieveCheckout) {
    throw coded('SUMUP_UNAVAILABLE')
  }

  return {
    provider: SUMUP_PROVIDER,
    testOnly,
    async prepare({ checkoutId, planId }) {
      const priced = priceForPlan(planId, catalog)
      if (!priced || !TOKEN_RE.test(String(checkoutId || '')) || String(checkoutId).length > 64) {
        throw coded('INVALID_PLAN')
      }
      let created
      try {
        created = await transport.createCheckout({
          amount: priced.amount,
          checkout_reference: checkoutId,
          currency: 'SEK',
          description: 'Viktkollen',
          hosted_checkout: { enabled: true },
          merchant_code: merchantCode,
        })
      } catch (error) {
        throw coded(error?.code === 'SUMUP_UNAVAILABLE' ? 'SUMUP_CHECKOUT_FAILED' : 'SUMUP_CHECKOUT_FAILED')
      }
      const checkoutRef = String(created?.id || '')
      const hostedCheckoutUrl = String(created?.hosted_checkout_url || '')
      if (!CHECKOUT_ID_RE.test(checkoutRef)
        || created?.checkout_reference !== checkoutId
        || created?.currency !== 'SEK'
        || created?.merchant_code !== merchantCode
        || minorUnitsFromSumUpAmount(created?.amount) !== priced.minor
        || !officialHostedUrl(hostedCheckoutUrl, checkoutRef)) {
        throw coded('SUMUP_CHECKOUT_FAILED')
      }
      return { hostedCheckoutUrl, providerCheckoutRef: checkoutRef }
    },
    async verify({ rawBody }) {
      const note = notificationId(rawBody)
      if (!note) return closed('INVALID_PROVIDER_EVENT', 400)
      let checkout
      try {
        checkout = await transport.retrieveCheckout(note)
      } catch {
        return closed('SUMUP_UNAVAILABLE', 503)
      }
      if (String(checkout?.id || '').toLowerCase() !== note.toLowerCase()) return closed('WRONG_CHECKOUT_REF', 400)
      const intentId = String(checkout?.checkout_reference || '')
      const intent = typeof intents?.get === 'function' ? await intents.get(intentId) : null
      if (!intent || intent.provider !== SUMUP_PROVIDER) return closed('CHECKOUT_INTENT_MISSING', 400)
      if (intent.status === 'cancelled') return closed('CHECKOUT_INTENT_CANCELLED', 400)
      if (intent.status === 'expired') return closed('CHECKOUT_INTENT_EXPIRED', 400)
      if (intent.providerCheckoutRef && intent.providerCheckoutRef !== checkout.id) return closed('WRONG_CHECKOUT_REF', 400)
      const priced = priceForPlan(intent.planId, catalog)
      if (!priced) return closed('INVALID_PLAN', 400)
      if (checkout.currency !== 'SEK') return closed('CURRENCY_MISMATCH', 400)
      if (minorUnitsFromSumUpAmount(checkout.amount) !== priced.minor) return closed('AMOUNT_MISMATCH', 400)
      if (checkout.merchant_code !== merchantCode) return closed('MERCHANT_MISMATCH', 400)
      if (checkout.status === 'PENDING') return closed('PAYMENT_PENDING', 400)
      if (checkout.status === 'FAILED' || checkout.status === 'EXPIRED') return closed('PAYMENT_FAILED', 400)
      if (checkout.status !== 'PAID') return closed('PAYMENT_UNKNOWN', 400)
      const customerRef = String(checkout.customer_id || '')
      if (!TOKEN_RE.test(customerRef)) return closed('CUSTOMER_REF_UNAVAILABLE', 400)
      const paid = (Array.isArray(checkout.transactions) ? checkout.transactions : [])
        .filter((row) => row?.status === 'SUCCESSFUL')
      if (paid.length !== 1 || !CHECKOUT_ID_RE.test(String(paid[0]?.id || ''))) return closed('PAYMENT_BINDING_UNAVAILABLE', 400)
      if (paid[0].currency !== 'SEK' || minorUnitsFromSumUpAmount(paid[0].amount) !== priced.minor) {
        return closed('AMOUNT_MISMATCH', 400)
      }
      const paidAt = new Date(paid[0].timestamp || '')
      if (Number.isNaN(paidAt.getTime())) return closed('PAYMENT_BINDING_UNAVAILABLE', 400)
      if (checkout.purpose === 'SETUP_RECURRING_PAYMENT') {
        return closed('SUMUP_SETUP_REQUIRES_ATOMIC_ACTIVATION', 400)
      }
      const period = sumUpMonthPeriod(paidAt)
      return {
        ok: true,
        payload: {
          checkoutId: intentId,
          paymentStatus: 'PAID',
          periodEnd: period.end,
          periodStart: period.start,
          provider: SUMUP_PROVIDER,
          providerCheckoutRef: checkout.id,
          providerCustomerRef: customerRef,
          providerEventId: `paid:${checkout.id}`,
          providerSubscriptionRef: String(paid[0].id),
          type: 'checkout.activated',
        },
      }
    },
  }
}

function priceForPlan(planId, catalog) {
  const plan = getPlanById(planId, catalog)
  if (!plan || plan.id === 'plan.free' || plan.currency !== 'SEK' || plan.active !== true) return null
  const amount = sumUpMajorFromMinor(plan.price_minor)
  if (amount == null) return null
  return { amount, minor: plan.price_minor }
}

function officialHostedUrl(value, checkoutId) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.hostname === 'checkout.sumup.com'
      && url.pathname === `/pay/${checkoutId}`
      && url.search === ''
  } catch {
    return false
  }
}

function notificationId(rawBody) {
  const parsed = parseJson(rawBody)
  if (!parsed || parsed.event_type !== 'CHECKOUT_STATUS_CHANGED') return null
  const id = String(parsed.id || '')
  return CHECKOUT_ID_RE.test(id) ? id : null
}

function parseJson(rawBody) {
  try {
    const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody || '') : rawBody
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function sumUpMonthPeriod(current) {
  const start = new Date(current)
  const end = new Date(start.getTime())
  const day = end.getUTCDate()
  end.setUTCDate(1)
  end.setUTCMonth(end.getUTCMonth() + 1)
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()
  end.setUTCDate(Math.min(day, lastDay))
  return { end: end.toISOString(), start: start.toISOString() }
}

function closed(code, status) {
  return { code, ok: false, status }
}

function coded(code) {
  const error = new Error(code)
  error.code = code
  return error
}
