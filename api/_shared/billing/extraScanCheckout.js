import { validateExtraScanSelection, EXTRA_SCAN_PRODUCTS } from '../../../src/services/billing/extraScanPurchases.js'
import { createSupabaseAdminClient } from '../supabaseServer.js'
import { createSumUpHttpTransport, readSumUpConfig, minorUnitsFromSumUpAmount } from './providers/sumup.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STAGING = 'https://armtslzspuebmlysnooq.supabase.co'
const PRICE_KEYS = { 'food.scan': 'EXTRA_SCAN_FOOD_MINOR', 'body.scan': 'EXTRA_SCAN_BODY_MINOR', 'ai.eye.analysis': 'EXTRA_SCAN_EYE_MINOR' }
function fail(code) { throw Object.assign(new Error(code), { code }) }

// Explicit project allowlist: Preview alone is not proof of isolation.
export function extraScanConfig(env = process.env) {
  if (env.VERCEL_ENV === 'production' || env.EXTRA_SCAN_SANDBOX_ENABLED !== 'true'
    || (env.SUPABASE_URL || env.VITE_SUPABASE_URL) !== STAGING) return null
  const sumup = readSumUpConfig(env)
  if (!sumup || env.SUMUP_MERCHANT_CODE !== env.EXTRA_SCAN_SANDBOX_MERCHANT_CODE) return null
  const prices = {}
  for (const [feature, key] of Object.entries(PRICE_KEYS)) {
    const value = Number(env[key])
    if (!Number.isSafeInteger(value) || value < 100 || value > 10000) return null
    prices[feature] = value
  }
  const callbackUrl = env.EXTRA_SCAN_SANDBOX_CALLBACK_URL
  if (typeof callbackUrl !== 'string' || !/^https:\/\/[a-z0-9-]+\.vercel\.app\/api\/billing\/extra-scans-webhook$/.test(callbackUrl)) return null
  return { ...sumup, prices, callbackUrl }
}

function hostedUrl(value) {
  return typeof value === 'string' && /^https:\/\/checkout\.sumup\.com\/pay\/[A-Za-z0-9_-]{1,128}$/.test(value)
}
function matches(checkout, intent) {
  return UUID.test(String(checkout?.id))
    && checkout.checkout_reference === intent.id
    && checkout.merchant_code === intent.merchant_code
    && checkout.currency === 'SEK'
    && minorUnitsFromSumUpAmount(checkout.amount) === intent.amount_minor
    && (!checkout.purpose || checkout.purpose === 'CHECKOUT')
}

export function createExtraScanService({ config, rpc, transport }) {
  async function read(userId, id) {
    if (!UUID.test(String(id))) fail('INVALID_INTENT')
    return rpc('read', userId, { id })
  }
  return {
    catalog: () => Object.entries(EXTRA_SCAN_PRODUCTS).map(([feature, row]) => ({ feature, label: row.label, unitPriceMinor: config.prices[feature], currency: 'SEK', validityHours: 720 })),
    balance: (userId) => rpc('balance', userId, {}),
    async create(userId, { feature, quantity, requestKey } = {}) {
      if (!userId || !UUID.test(String(requestKey)) || !validateExtraScanSelection({ feature, quantity }).ok) fail('INVALID_SELECTION')
      const intent = await rpc('create', userId, { request_key: requestKey, feature, quantity, amount_minor: config.prices[feature] * quantity, merchant_code: config.merchantCode })
      if (intent.provider_checkout_id) return intent
      if (Date.now() - Date.parse(intent.created_at) > 30 * 60 * 1000) fail('INTENT_EXPIRED')
      let checkout
      try {
        checkout = await transport.createCheckout({ amount: intent.amount_minor / 100, currency: 'SEK', merchant_code: intent.merchant_code, checkout_reference: intent.id, description: 'Viktkollen extra scans', hosted_checkout: { enabled: true }, return_url: config.callbackUrl, valid_until: new Date(Date.parse(intent.created_at) + 30 * 60 * 1000).toISOString() })
      } catch {
        // A timeout may have created a checkout. Recover by unique reference;
        // never create a different intent automatically after a network failure.
        const rows = await transport.listCheckouts(intent.id)
        const list = Array.isArray(rows) ? rows : rows?.items || rows?.checkouts || []
        if (list.length !== 1) fail('CHECKOUT_UNAVAILABLE')
        checkout = list[0]
      }
      if (!matches(checkout, intent) || !hostedUrl(checkout.hosted_checkout_url)) fail('CHECKOUT_MISMATCH')
      return rpc('bind', userId, { id: intent.id, provider_checkout_id: checkout.id, hosted_url: checkout.hosted_checkout_url })
    },
    async verify(userId, id) {
      const intent = await read(userId, id)
      if (!intent.provider_checkout_id) return { status: 'PENDING' }
      const checkout = await transport.retrieveCheckout(intent.provider_checkout_id)
      if (!matches(checkout, intent) || checkout.id !== intent.provider_checkout_id) fail('PAYMENT_MISMATCH')
      const transactions = Array.isArray(checkout.transactions) ? checkout.transactions : []
      // Fail closed on any refund/reversal, including a partially refunded batch.
      if (transactions.some(t => ['REFUNDED', 'PARTIALLY_REFUNDED', 'CHARGEBACK', 'REVERSED'].includes(t.status))
        || ['REFUNDED', 'REVERSED'].includes(checkout.status)) {
        return rpc('reverse', userId, { id })
      }
      if (checkout.status !== 'PAID') return { status: checkout.status === 'FAILED' ? 'FAILED' : 'PENDING' }
      const paid = transactions.filter(t => t.status === 'SUCCESSFUL')
      if (paid.length !== 1 || !UUID.test(String(paid[0].id)) || paid[0].currency !== 'SEK'
        || minorUnitsFromSumUpAmount(paid[0].amount) !== intent.amount_minor) fail('PAYMENT_MISMATCH')
      return rpc('grant', userId, { id, provider_checkout_id: checkout.id })
    },
    async webhook(checkoutId) {
      if (!UUID.test(String(checkoutId))) fail('INVALID_CHECKOUT')
      const checkout = await transport.retrieveCheckout(checkoutId)
      if (!UUID.test(String(checkout?.checkout_reference))) fail('INVALID_INTENT')
      const intent = await rpc('lookup_webhook', null, { id: checkout.checkout_reference })
      if (intent.provider_checkout_id !== checkoutId) fail('PAYMENT_MISMATCH')
      return this.verify(intent.user_id, intent.id)
    },
  }
}

export function serverExtraScanService(env = process.env) {
  const config = extraScanConfig(env)
  if (!config) return null
  const client = createSupabaseAdminClient(env)
  if (!client) return null
  return createExtraScanService({ config, transport: createSumUpHttpTransport(config), rpc: async (action, userId, data) => {
    const result = await client.schema('billing').rpc('extra_scan_purchase', { p_action: action, p_user_id: userId, p_data: data })
    if (result.error) fail('PURCHASE_UNAVAILABLE')
    return result.data
  } })
}
