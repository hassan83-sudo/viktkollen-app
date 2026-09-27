import { createHash } from 'node:crypto'
import { SUBSCRIPTION_STATUS } from '../../../src/services/billing/catalog.js'
import { getPlanById } from '../../../src/services/billing/planCatalog.js'
import { minorUnitsFromSumUpAmount, sumUpMajorFromMinor, SUMUP_PROVIDER } from './providers/sumup.js'

const DUE_STATUS = new Set([SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.PAST_DUE])

export function sumUpCustomerIdForUser(userId) {
  const compact = String(userId || '').replace(/-/g, '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(compact)) return null
  return `vk${compact}`
}

export function instrumentFingerprint(token) {
  const value = String(token || '')
  if (!/^[A-Za-z0-9._:-]{8,80}$/.test(value)) return null
  return createHash('sha256').update(value).digest('hex')
}

export function renewalReference(subscriptionId, periodEnd) {
  return stableReference('rn', `${subscriptionId}|${new Date(periodEnd).toISOString()}`)
}

export function createSumUpRecurringState() {
  return { attempts: [], instruments: [], setups: [] }
}

/**
 * Local recurring foundation. The payment instrument token is used only to
 * call SumUp and is not stored, returned, or logged. A SHA-256 fingerprint
 * binds the verified instrument. Renewal retries reuse checkout_reference;
 * SumUp rejects a second checkout with that reference.
 */
export function createSumUpRecurring({
  lifecycle,
  merchantCode,
  now = () => new Date(),
  state = createSumUpRecurringState(),
  transport,
} = {}) {
  return {
    async beginRecurringSetup({
      amount,
      clientCustomerId,
      clientUserId,
      currency,
      planId,
      subscription,
      userId,
    } = {}) {
      void amount
      void clientCustomerId
      void clientUserId
      void currency
      void planId
      if (!userId) return failure('AUTH_REQUIRED')
      if (!subscription || subscription.user_id !== userId || subscription.provider !== SUMUP_PROVIDER) {
        return failure('SUBSCRIPTION_NOT_ELIGIBLE')
      }
      const priced = priceFor(chargePlanId(subscription))
      const customerId = sumUpCustomerIdForUser(userId)
      if (!priced || !customerId) return failure('INVALID_PLAN')
      await createCustomer(transport, customerId)
      const reference = stableReference('su', `${userId}|${subscription.subscription_id}|setup`)
      let created
      try {
        created = await transport.createCheckout({
          amount: priced.amount,
          checkout_reference: reference,
          currency: 'SEK',
          customer_id: customerId,
          description: 'Viktkollen',
          merchant_code: merchantCode,
          purpose: 'SETUP_RECURRING_PAYMENT',
        })
      } catch (error) {
        if (error?.code !== 'SUMUP_REFERENCE_EXISTS') return failure('SUMUP_CHECKOUT_FAILED')
        created = await singleCheckout(transport, reference)
      }
      const checkout = created?.id ? await transport.retrieveCheckout(created.id) : null
      if (!checkout?.id || checkout.purpose !== 'SETUP_RECURRING_PAYMENT' || checkout.customer_id !== customerId) {
        return failure('SUMUP_CHECKOUT_FAILED')
      }
      if (!samePrice(checkout, priced)) return failure('AMOUNT_MISMATCH')
      state.setups = state.setups.filter((row) => row.subscriptionId !== subscription.subscription_id)
      state.setups.push({
        checkoutId: checkout.id,
        customerId,
        reference,
        subscriptionId: subscription.subscription_id,
        userId,
      })
      return {
        accessGranted: false,
        checkoutId: checkout.id,
        status: 'pending',
      }
    },
    async confirmRecurringInstrument({ clientToken, instrumentToken, subscription, token, userId } = {}) {
      if (clientToken != null || instrumentToken != null || token != null) return failure('CLIENT_INSTRUMENT_REJECTED')
      if (!userId || !subscription || subscription.user_id !== userId) return failure('SUBSCRIPTION_NOT_ELIGIBLE')
      const setup = state.setups.find((row) => row.subscriptionId === subscription.subscription_id && row.userId === userId)
      if (!setup) return failure('RECURRING_SETUP_MISSING')
      const checkout = await transport.retrieveCheckout(setup.checkoutId)
      const customerId = sumUpCustomerIdForUser(userId)
      if (checkout?.customer_id !== customerId || checkout?.purpose !== 'SETUP_RECURRING_PAYMENT') {
        return failure('CUSTOMER_MISMATCH')
      }
      if (checkout.status !== 'PAID') return failure(checkout.status === 'PENDING' ? 'PAYMENT_PENDING' : 'PAYMENT_FAILED')
      const priced = priceFor(chargePlanId(subscription))
      if (!priced || checkout.currency !== 'SEK' || minorUnitsFromSumUpAmount(checkout.amount) !== priced.minor) {
        return failure('AMOUNT_MISMATCH')
      }
      if (checkout.merchant_code !== merchantCode) return failure('MERCHANT_MISMATCH')
      const fingerprint = instrumentFingerprint(checkout.payment_instrument?.token)
      if (!fingerprint) return failure('UNVERIFIED_INSTRUMENT')
      if (state.instruments.some((row) => row.fingerprint === fingerprint && row.subscriptionId !== subscription.subscription_id)) {
        return failure('INSTRUMENT_CONFLICT')
      }
      if (state.instruments.some((row) => row.customerId === customerId && row.subscriptionId !== subscription.subscription_id)) {
        return failure('INSTRUMENT_CONFLICT')
      }
      const current = state.instruments.find((row) => row.subscriptionId === subscription.subscription_id)
      if (current && (current.userId !== userId || current.fingerprint !== fingerprint)) return failure('INSTRUMENT_CONFLICT')
      if (!current) {
        state.instruments.push({
          customerId,
          fingerprint,
          subscriptionId: subscription.subscription_id,
          userId,
        })
      }
      return { accessGranted: false, status: 'verified', subscriptionId: subscription.subscription_id, userId }
    },
    async processDueRenewals({ limit = 20, subscriptions = [] } = {}) {
      const due = subscriptions.filter((row) => eligible(row, now())).slice(0, limit)
      const results = []
      for (const subscription of due) results.push(await renewOne(subscription))
      return {
        accessGranted: false,
        considered: due.length,
        results: results.map(publicRenewalResult),
      }
    },
  }

  async function renewOne(subscription) {
    const binding = state.instruments.find((row) => row.subscriptionId === subscription.subscription_id && row.userId === subscription.user_id)
    if (!binding) return { charged: false, code: 'MISSING_INSTRUMENT', subscriptionId: subscription.subscription_id }
    const planId = chargePlanId(subscription)
    const priced = priceFor(planId)
    if (!priced) return { charged: false, code: 'INVALID_PLAN', subscriptionId: subscription.subscription_id }
    const reference = renewalReference(subscription.subscription_id, subscription.current_period_end)
    let attempt = state.attempts.find((row) => row.reference === reference)
    if (!attempt) {
      attempt = {
        periodEnd: new Date(subscription.current_period_end).toISOString(),
        providerCheckoutRef: '',
        reference,
        status: 'reserved',
        subscriptionId: subscription.subscription_id,
      }
      state.attempts.push(attempt)
    }
    if (attempt.subscriptionId !== subscription.subscription_id) return { charged: false, code: 'RENEWAL_ATTEMPT_CONFLICT', subscriptionId: subscription.subscription_id }
    if (attempt.status === 'succeeded') return applySuccess(subscription, attempt)
    if (attempt.status === 'failed') return { charged: false, code: 'RENEWAL_FAILED', subscriptionId: subscription.subscription_id }
    if (attempt.status === 'processing') return reconcile(subscription, attempt, priced)
    let checkout = await singleCheckout(transport, reference)
    if (!checkout) {
      try {
        checkout = await transport.createCheckout({
          amount: priced.amount,
          checkout_reference: reference,
          currency: 'SEK',
          customer_id: binding.customerId,
          description: 'Viktkollen',
          merchant_code: merchantCode,
          purpose: 'CHECKOUT',
        })
      } catch (error) {
        checkout = await singleCheckout(transport, reference)
        if (!checkout) return { ambiguous: true, charged: false, code: error?.code || 'SUMUP_TIMEOUT', subscriptionId: subscription.subscription_id }
      }
    }
    attempt.providerCheckoutRef = checkout.id
    attempt.status = attempt.status === 'reserved' ? 'created' : attempt.status
    const verified = await transport.retrieveCheckout(checkout.id)
    if (!samePrice(verified, priced) || verified.customer_id !== binding.customerId) {
      return { charged: false, code: 'AMOUNT_MISMATCH', subscriptionId: subscription.subscription_id }
    }
    if (verified.status === 'PAID') return applySuccess(subscription, attempt, verified)
    if (verified.status === 'FAILED' || verified.status === 'EXPIRED') return applyFailure(subscription, attempt)
    if (attempt.status === 'processing') return { ambiguous: true, charged: false, code: 'RENEWAL_AMBIGUOUS', subscriptionId: subscription.subscription_id }
    const instruments = await transport.listPaymentInstruments(binding.customerId)
    const matches = (Array.isArray(instruments) ? instruments : []).filter((row) => instrumentFingerprint(row?.token) === binding.fingerprint)
    if (matches.length !== 1) return { charged: false, code: 'MISSING_INSTRUMENT', subscriptionId: subscription.subscription_id }
    attempt.status = 'processing'
    try {
      await transport.processCheckout(verified.id, {
        customer_id: binding.customerId,
        payment_type: 'card',
        token: matches[0].token,
      })
    } catch (error) {
      return { ambiguous: true, charged: false, code: error?.code || 'SUMUP_TIMEOUT', subscriptionId: subscription.subscription_id }
    }
    const after = await transport.retrieveCheckout(verified.id)
    if (after.status === 'PAID' && samePrice(after, priced)) return applySuccess(subscription, attempt, after)
    if (after.status === 'FAILED' || after.status === 'EXPIRED') return applyFailure(subscription, attempt)
    return { ambiguous: true, charged: false, code: 'RENEWAL_AMBIGUOUS', subscriptionId: subscription.subscription_id }
  }

  async function reconcile(subscription, attempt, priced) {
    const checkout = await singleCheckout(transport, attempt.reference)
    if (!checkout) return { ambiguous: true, charged: false, code: 'RENEWAL_AMBIGUOUS', subscriptionId: subscription.subscription_id }
    const verified = await transport.retrieveCheckout(checkout.id)
    if (verified.status === 'PAID' && samePrice(verified, priced)) return applySuccess(subscription, attempt, verified)
    if (verified.status === 'FAILED' || verified.status === 'EXPIRED') return applyFailure(subscription, attempt)
    return { ambiguous: true, charged: false, code: 'RENEWAL_AMBIGUOUS', subscriptionId: subscription.subscription_id }
  }

  async function applySuccess(subscription, attempt, checkout) {
    const nextEnd = addUtcMonths(new Date(subscription.current_period_end), 1).toISOString()
    const applied = await lifecycle.applyTrustedRenewal({
      current_period_end: nextEnd,
      external_event_id: `ok_${attempt.reference}`,
      outcome: 'succeeded',
      subscription_id: subscription.subscription_id,
    })
    attempt.status = 'succeeded'
    if (checkout?.id) attempt.providerCheckoutRef = checkout.id
    return {
      charged: true,
      code: 'RENEWAL_SUCCEEDED',
      planId: applied.subscription.plan_id,
      subscriptionId: subscription.subscription_id,
      assignmentPlanId: applied.assignment?.plan_id || null,
    }
  }

  async function applyFailure(subscription, attempt) {
    const grace = new Date(new Date(subscription.current_period_end).getTime() + (7 * 24 * 60 * 60 * 1000)).toISOString()
    const applied = await lifecycle.applyTrustedRenewal({
      current_period_end: new Date(subscription.current_period_end).toISOString(),
      external_event_id: `fail_${attempt.reference}`,
      outcome: 'failed',
      past_due_grace_until: grace,
      subscription_id: subscription.subscription_id,
    })
    attempt.status = 'failed'
    return {
      assignmentPlanId: applied.assignment?.plan_id || null,
      charged: false,
      code: 'RENEWAL_FAILED',
      status: applied.subscription.status,
      subscriptionId: subscription.subscription_id,
    }
  }
}

function eligible(subscription, current) {
  if (!subscription || subscription.provider !== SUMUP_PROVIDER) return false
  if (subscription.cancel_at_period_end === true) return false
  if (!DUE_STATUS.has(subscription.status)) return false
  const end = new Date(subscription.current_period_end).getTime()
  return !Number.isNaN(end) && end <= current.getTime()
}

function chargePlanId(subscription) {
  if (subscription.pending_plan_change === 'next_period' && subscription.pending_plan_id) return subscription.pending_plan_id
  return subscription.plan_id
}

function priceFor(planId) {
  const plan = getPlanById(planId)
  if (!plan || plan.currency !== 'SEK' || plan.id === 'plan.free' || plan.active !== true) return null
  const amount = sumUpMajorFromMinor(plan.price_minor)
  if (amount == null) return null
  return { amount, minor: plan.price_minor, planId: plan.id }
}

function samePrice(checkout, priced) {
  return checkout?.currency === 'SEK' && minorUnitsFromSumUpAmount(checkout.amount) === priced.minor
}

function stableReference(prefix, seed) {
  return `${prefix}${createHash('sha256').update(seed).digest('hex').slice(0, 40)}`
}

function publicRenewalResult(result) {
  return {
    assignmentPlanId: result.assignmentPlanId || null,
    charged: result.charged === true,
    code: result.code,
    subscriptionId: result.subscriptionId,
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
  if (rows.length > 1) {
    const error = new Error('renewal_attempt_conflict')
    error.code = 'RENEWAL_ATTEMPT_CONFLICT'
    throw error
  }
  return rows[0] || null
}

function failure(code) {
  return { accessGranted: false, code, ok: false }
}

function addUtcMonths(date, months) {
  const end = new Date(date.getTime())
  const day = end.getUTCDate()
  end.setUTCDate(1)
  end.setUTCMonth(end.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()
  end.setUTCDate(Math.min(day, lastDay))
  return end
}
