import { createHash } from 'node:crypto'
import { SUBSCRIPTION_STATUS } from '../../../src/services/billing/catalog.js'
import { getPlanById } from '../../../src/services/billing/planCatalog.js'
import { minorUnitsFromSumUpAmount, sumUpMajorFromMinor, SUMUP_PROVIDER } from './providers/sumup.js'

const DUE_STATUS = new Set([SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.PAST_DUE])
const FINGERPRINT_RE = /^[0-9a-f]{64}$/
export const SUMUP_INSTRUMENT_FINGERPRINT_RPC = 'billing.read_sumup_instrument_fingerprint'
export const SUMUP_RENEWAL_CLAIM_RPC = 'billing.claim_sumup_renewal_attempt'
export const SUMUP_RENEWAL_FINISH_RPC = 'billing.finish_sumup_renewal_attempt'
export const SUMUP_RENEWAL_RESERVE_RPC = 'billing.reserve_sumup_renewal_attempt'

export function createServerSumUpInstrumentFingerprintReader(callRpc) {
  return async function readInstrumentFingerprint(subscriptionId) {
    if (typeof callRpc !== 'function') return null
    const data = await callRpc(SUMUP_INSTRUMENT_FINGERPRINT_RPC, {
      p_subscription_id: subscriptionId,
    })
    return FINGERPRINT_RE.test(data) ? data : null
  }
}

export function createServerSumUpRenewalReserver(callRpc) {
  return async function reserveRenewalAttempt({ periodEnd, reference, subscriptionId } = {}) {
    const conflict = new Error('renewal_attempt_conflict')
    conflict.code = 'renewal_attempt_conflict'
    if (typeof callRpc !== 'function') throw conflict
    let data
    try {
      data = await callRpc(SUMUP_RENEWAL_RESERVE_RPC, {
        p_checkout_reference: reference,
        p_period_end: new Date(periodEnd).toISOString(),
        p_subscription_id: subscriptionId,
      })
    } catch (error) {
      const message = `${error?.code || ''} ${error?.message || ''}`
      if (message.includes('renewal_attempt_conflict') || message.includes('23505') || message.toLowerCase().includes('unique')) {
        throw conflict
      }
      throw error
    }
    if (!data || data.checkout_reference !== reference || typeof data.status !== 'string') throw conflict
    return {
      inserted: data.inserted === true,
      periodEnd: new Date(periodEnd).toISOString(),
      providerCheckoutRef: '',
      reference,
      status: data.status,
      subscriptionId,
    }
  }
}

function renewalAttemptConflict() {
  const conflict = new Error('renewal_attempt_conflict')
  conflict.code = 'renewal_attempt_conflict'
  return conflict
}

function rethrowRenewalConflict(error) {
  const message = `${error?.code || ''} ${error?.message || ''}`
  if (message.includes('renewal_attempt_conflict') || message.includes('23505') || message.toLowerCase().includes('unique')) {
    throw renewalAttemptConflict()
  }
  throw error
}

export function createServerSumUpRenewalClaimer(callRpc) {
  return async function claimRenewalAttempt({
    periodEnd,
    providerCheckoutRef = '',
    reference,
    subscriptionId,
    takeover,
    toStatus,
  } = {}) {
    if (typeof callRpc !== 'function' || (takeover !== true && takeover !== false)) throw renewalAttemptConflict()
    if (toStatus !== 'created' && toStatus !== 'processing') throw renewalAttemptConflict()
    let data
    try {
      data = await callRpc(SUMUP_RENEWAL_CLAIM_RPC, {
        p_checkout_reference: reference,
        p_period_end: new Date(periodEnd).toISOString(),
        p_provider_checkout_ref: providerCheckoutRef || '',
        p_subscription_id: subscriptionId,
        p_takeover: takeover,
        p_to_status: toStatus,
      })
    } catch (error) {
      rethrowRenewalConflict(error)
    }
    if (!data || data.checkout_reference !== reference || typeof data.status !== 'string' || (data.claimed !== true && data.claimed !== false)) {
      throw renewalAttemptConflict()
    }
    return {
      claimed: data.claimed === true,
      providerCheckoutRef: typeof data.provider_checkout_ref === 'string' ? data.provider_checkout_ref : '',
      status: data.status,
      takeoverAllowed: data.takeover_allowed === true,
    }
  }
}

export function createServerSumUpRenewalFinisher(callRpc) {
  return async function finishRenewalAttempt({
    periodEnd,
    providerCheckoutRef = '',
    reference,
    status,
    subscriptionId,
  } = {}) {
    if (typeof callRpc !== 'function' || (status !== 'succeeded' && status !== 'failed')) throw renewalAttemptConflict()
    let data
    try {
      data = await callRpc(SUMUP_RENEWAL_FINISH_RPC, {
        p_checkout_reference: reference,
        p_period_end: new Date(periodEnd).toISOString(),
        p_provider_checkout_ref: providerCheckoutRef || '',
        p_status: status,
        p_subscription_id: subscriptionId,
      })
    } catch (error) {
      rethrowRenewalConflict(error)
    }
    if (!data || data.checkout_reference !== reference || data.status !== status) throw renewalAttemptConflict()
    return { providerCheckoutRef: providerCheckoutRef || '', status: data.status }
  }
}

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

export function reserveSumUpRenewalAttempt(state, { periodEnd, reference, subscriptionId } = {}) {
  const period = new Date(periodEnd).toISOString()
  const existing = state.attempts.find((row) => row.reference === reference)
  if (existing) {
    if (existing.subscriptionId !== subscriptionId || existing.periodEnd !== period) {
      const error = new Error('renewal_attempt_conflict')
      error.code = 'renewal_attempt_conflict'
      throw error
    }
    return existing
  }
  const samePeriod = state.attempts.find((row) => row.subscriptionId === subscriptionId && row.periodEnd === period)
  if (samePeriod) {
    const error = new Error('renewal_attempt_conflict')
    error.code = 'renewal_attempt_conflict'
    throw error
  }
  const attempt = {
    periodEnd: period,
    providerCheckoutRef: '',
    reference,
    status: 'reserved',
    subscriptionId,
  }
  state.attempts.push(attempt)
  return attempt
}

export function markSumUpRenewalProcessing(state, { reference, subscriptionId } = {}) {
  const attempt = state.attempts.find((row) => row.reference === reference)
  if (!attempt) {
    const error = new Error('renewal_attempt_not_found')
    error.code = 'renewal_attempt_not_found'
    throw error
  }
  if (attempt.subscriptionId !== subscriptionId) {
    const error = new Error('renewal_attempt_conflict')
    error.code = 'renewal_attempt_conflict'
    throw error
  }
  if (attempt.status === 'processing') return attempt
  if (attempt.status !== 'reserved') {
    const error = new Error('illegal_renewal_transition')
    error.code = 'illegal_renewal_transition'
    throw error
  }
  attempt.status = 'processing'
  return attempt
}

/**
 * Local recurring foundation. The payment instrument token is used only to
 * call SumUp and is not stored, returned, or logged. A SHA-256 fingerprint
 * binds the verified instrument. Renewal retries reuse checkout_reference;
 * SumUp rejects a second checkout with that reference.
 */
export function createSumUpRecurring({
  claimRenewalAttempt = null,
  finishRenewalAttempt = null,
  lifecycle,
  merchantCode,
  now = () => new Date(),
  readInstrumentFingerprint = null,
  reserveRenewalAttempt = null,
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
    const binding = await bindingFor(subscription)
    if (!binding) return { charged: false, code: 'MISSING_INSTRUMENT', subscriptionId: subscription.subscription_id }
    const planId = chargePlanId(subscription)
    const priced = priceFor(planId)
    if (!priced) return { charged: false, code: 'INVALID_PLAN', subscriptionId: subscription.subscription_id }
    const reference = renewalReference(subscription.subscription_id, subscription.current_period_end)
    const sharedReservation = typeof reserveRenewalAttempt === 'function'
    const durableClaims = sharedReservation
      && typeof claimRenewalAttempt === 'function'
      && typeof finishRenewalAttempt === 'function'
    let attempt
    try {
      attempt = sharedReservation
        ? await reserveRenewalAttempt({
          periodEnd: subscription.current_period_end,
          reference,
          subscriptionId: subscription.subscription_id,
        })
        : reserveSumUpRenewalAttempt(state, {
          periodEnd: subscription.current_period_end,
          reference,
          subscriptionId: subscription.subscription_id,
        })
    } catch (error) {
      if (error?.code === 'renewal_attempt_conflict') {
        return { charged: false, code: 'RENEWAL_ATTEMPT_CONFLICT', subscriptionId: subscription.subscription_id }
      }
      throw error
    }
    if (sharedReservation) {
      if (attempt.inserted !== true) {
        if (durableClaims) return recoverShared(subscription, attempt, priced, binding)
        if (attempt.status === 'succeeded') {
          return { charged: false, code: 'RENEWAL_SUCCEEDED', subscriptionId: subscription.subscription_id }
        }
        if (attempt.status === 'failed') {
          return { charged: false, code: 'RENEWAL_FAILED', subscriptionId: subscription.subscription_id }
        }
        return { charged: false, code: 'RENEWAL_IN_PROGRESS', subscriptionId: subscription.subscription_id }
      }
      state.attempts.push(attempt)
      if (durableClaims) return openAndCharge(subscription, attempt, priced, binding, false)
    }
    if (attempt.status === 'succeeded') return applySuccess(subscription, attempt)
    if (attempt.status === 'failed') return { charged: false, code: 'RENEWAL_FAILED', subscriptionId: subscription.subscription_id }
    if (attempt.status === 'processing') return reconcile(subscription, attempt, priced)
    if (attempt.status !== 'reserved') {
      return { charged: false, code: 'illegal_renewal_transition', subscriptionId: subscription.subscription_id }
    }
    let checkout = await singleCheckout(transport, reference)
    if (!checkout) {
      if (!await oneMatchingToken(binding)) {
        return { charged: false, code: 'MISSING_INSTRUMENT', subscriptionId: subscription.subscription_id }
      }
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
    const verified = await transport.retrieveCheckout(checkout.id)
    if (!samePrice(verified, priced) || verified.customer_id !== binding.customerId) {
      return { charged: false, code: 'AMOUNT_MISMATCH', subscriptionId: subscription.subscription_id }
    }
    if (verified.status === 'PAID') return applySuccess(subscription, attempt, verified)
    if (verified.status === 'FAILED' || verified.status === 'EXPIRED') return applyFailure(subscription, attempt)
    const instrumentToken = await oneMatchingToken(binding)
    if (!instrumentToken) return { charged: false, code: 'MISSING_INSTRUMENT', subscriptionId: subscription.subscription_id }
    markSumUpRenewalProcessing(state, {
      reference: attempt.reference,
      subscriptionId: subscription.subscription_id,
    })
    try {
      await transport.processCheckout(verified.id, {
        customer_id: binding.customerId,
        payment_type: 'card',
        token: instrumentToken,
      })
    } catch (error) {
      return { ambiguous: true, charged: false, code: error?.code || 'SUMUP_TIMEOUT', subscriptionId: subscription.subscription_id }
    }
    const after = await transport.retrieveCheckout(verified.id)
    if (after.status === 'PAID' && samePrice(after, priced)) return applySuccess(subscription, attempt, after)
    if (after.status === 'FAILED' || after.status === 'EXPIRED') return applyFailure(subscription, attempt)
    return { ambiguous: true, charged: false, code: 'RENEWAL_AMBIGUOUS', subscriptionId: subscription.subscription_id }
  }

  async function bindingFor(subscription) {
    const customerId = sumUpCustomerIdForUser(subscription.user_id)
    if (!customerId) return null
    if (typeof readInstrumentFingerprint === 'function') {
      let stored = null
      try {
        stored = await readInstrumentFingerprint(subscription.subscription_id)
      } catch {
        // A failed lookup leaves the fingerprint unread.
      }
      if (!FINGERPRINT_RE.test(stored)) return null
      return { customerId, fingerprint: stored }
    }
    const memory = state.instruments.find((row) => row.subscriptionId === subscription.subscription_id && row.userId === subscription.user_id)
    if (!memory || memory.customerId !== customerId || !FINGERPRINT_RE.test(memory.fingerprint)) return null
    return { customerId, fingerprint: memory.fingerprint }
  }

  async function oneMatchingToken(binding) {
    let instruments
    try {
      instruments = await transport.listPaymentInstruments(binding.customerId)
    } catch {
      return null
    }
    const matches = (Array.isArray(instruments) ? instruments : []).filter((row) => {
      if (!row || row.active === false) return false
      return instrumentFingerprint(row.token) === binding.fingerprint
    })
    if (matches.length !== 1) return null
    return matches[0].token
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

  async function recoverShared(subscription, attempt, priced, binding) {
    if (attempt.status === 'succeeded') {
      await finishDurable(attempt, 'succeeded', attempt.providerCheckoutRef)
      return applySuccess(subscription, attempt)
    }
    if (attempt.status === 'failed') {
      await finishDurable(attempt, 'failed', attempt.providerCheckoutRef)
      return applyFailure(subscription, attempt)
    }
    if (attempt.status === 'processing') return reconcileDurable(subscription, attempt, priced, binding)
    if (attempt.status !== 'reserved' && attempt.status !== 'created') {
      return { charged: false, code: 'illegal_renewal_transition', subscriptionId: subscription.subscription_id }
    }
    const probe = await claimRenewalAttempt({
      periodEnd: attempt.periodEnd,
      providerCheckoutRef: '',
      reference: attempt.reference,
      subscriptionId: attempt.subscriptionId,
      takeover: true,
      toStatus: 'created',
    })
    if (probe.status === 'processing') return reconcileDurable(subscription, attempt, priced, binding)
    if (probe.status === 'succeeded' || probe.status === 'failed') {
      attempt.status = probe.status
      attempt.providerCheckoutRef = probe.providerCheckoutRef || attempt.providerCheckoutRef
      return recoverShared(subscription, attempt, priced, binding)
    }
    if (probe.takeoverAllowed !== true || (probe.status !== 'reserved' && probe.status !== 'created')) {
      return { charged: false, code: 'RENEWAL_IN_PROGRESS', subscriptionId: subscription.subscription_id }
    }
    attempt.status = probe.status
    if (probe.providerCheckoutRef) attempt.providerCheckoutRef = probe.providerCheckoutRef
    return openAndCharge(subscription, attempt, priced, binding, true)
  }

  async function openAndCharge(subscription, attempt, priced, binding, takeover) {
    const reference = attempt.reference
    let checkout = await singleCheckout(transport, reference)
    if (!checkout && attempt.status !== 'reserved') {
      return { ambiguous: true, charged: false, code: 'RENEWAL_AMBIGUOUS', subscriptionId: subscription.subscription_id }
    }
    if (!checkout) {
      if (!await oneMatchingToken(binding)) {
        return { charged: false, code: 'MISSING_INSTRUMENT', subscriptionId: subscription.subscription_id }
      }
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
    let chargeTakeover = takeover
    if (attempt.status === 'reserved') {
      const created = await claimRenewalAttempt({
        periodEnd: attempt.periodEnd,
        providerCheckoutRef: checkout.id,
        reference,
        subscriptionId: attempt.subscriptionId,
        takeover: chargeTakeover,
        toStatus: 'created',
      })
      attempt.providerCheckoutRef = created.providerCheckoutRef || checkout.id
      if (created.status === 'processing' || created.status === 'succeeded' || created.status === 'failed') {
        attempt.status = created.status
        return recoverShared(subscription, attempt, priced, binding)
      }
      if (created.claimed === true) {
        chargeTakeover = false
        attempt.status = 'created'
      } else if (chargeTakeover === true && created.status === 'created' && created.takeoverAllowed === true) {
        attempt.status = 'created'
      } else {
        attempt.status = created.status
        return { charged: false, code: 'RENEWAL_IN_PROGRESS', subscriptionId: subscription.subscription_id }
      }
    }
    const verified = checkout?.id ? await transport.retrieveCheckout(checkout.id) : null
    if (!verified || !samePrice(verified, priced) || verified.customer_id !== binding.customerId) {
      return { charged: false, code: 'AMOUNT_MISMATCH', subscriptionId: subscription.subscription_id }
    }
    if (verified.status === 'PAID') {
      await finishDurable(attempt, 'succeeded', verified.id)
      return applySuccess(subscription, attempt, verified)
    }
    if (verified.status === 'FAILED' || verified.status === 'EXPIRED') {
      await finishDurable(attempt, 'failed', verified.id)
      return applyFailure(subscription, attempt)
    }
    if (verified.status !== 'PENDING') {
      return { ambiguous: true, charged: false, code: 'RENEWAL_AMBIGUOUS', subscriptionId: subscription.subscription_id }
    }
    const instrumentToken = await oneMatchingToken(binding)
    if (!instrumentToken) return { charged: false, code: 'MISSING_INSTRUMENT', subscriptionId: subscription.subscription_id }
    const processing = await claimRenewalAttempt({
      periodEnd: attempt.periodEnd,
      providerCheckoutRef: verified.id,
      reference,
      subscriptionId: attempt.subscriptionId,
      takeover: chargeTakeover,
      toStatus: 'processing',
    })
    attempt.providerCheckoutRef = processing.providerCheckoutRef || verified.id
    if (processing.claimed !== true) {
      attempt.status = processing.status
      if (processing.status === 'processing' || processing.status === 'succeeded' || processing.status === 'failed') {
        return recoverShared(subscription, attempt, priced, binding)
      }
      return { charged: false, code: 'RENEWAL_IN_PROGRESS', subscriptionId: subscription.subscription_id }
    }
    attempt.status = 'processing'
    try {
      await transport.processCheckout(verified.id, {
        customer_id: binding.customerId,
        payment_type: 'card',
        token: instrumentToken,
      })
    } catch (error) {
      return { ambiguous: true, charged: false, code: error?.code || 'SUMUP_TIMEOUT', subscriptionId: subscription.subscription_id }
    }
    const after = await transport.retrieveCheckout(verified.id)
    if (after?.status === 'PAID' && samePrice(after, priced) && after.customer_id === binding.customerId) {
      await finishDurable(attempt, 'succeeded', verified.id)
      return applySuccess(subscription, attempt, after)
    }
    if (after?.status === 'FAILED' || after?.status === 'EXPIRED') {
      await finishDurable(attempt, 'failed', verified.id)
      return applyFailure(subscription, attempt)
    }
    return { ambiguous: true, charged: false, code: 'RENEWAL_AMBIGUOUS', subscriptionId: subscription.subscription_id }
  }

  async function reconcileDurable(subscription, attempt, priced, binding) {
    const checkout = await singleCheckout(transport, attempt.reference)
    if (!checkout?.id) return { ambiguous: true, charged: false, code: 'RENEWAL_AMBIGUOUS', subscriptionId: subscription.subscription_id }
    const verified = await transport.retrieveCheckout(checkout.id)
    if (verified?.status === 'PAID' && samePrice(verified, priced) && verified.customer_id === binding.customerId) {
      await finishDurable(attempt, 'succeeded', verified.id)
      return applySuccess(subscription, attempt, verified)
    }
    if (verified?.status === 'FAILED' || verified?.status === 'EXPIRED') {
      await finishDurable(attempt, 'failed', verified.id)
      return applyFailure(subscription, attempt)
    }
    return { ambiguous: true, charged: false, code: 'RENEWAL_AMBIGUOUS', subscriptionId: subscription.subscription_id }
  }

  async function finishDurable(attempt, status, providerCheckoutRef) {
    const finished = await finishRenewalAttempt({
      periodEnd: attempt.periodEnd,
      providerCheckoutRef: providerCheckoutRef || '',
      reference: attempt.reference,
      status,
      subscriptionId: attempt.subscriptionId,
    })
    attempt.status = finished.status
    if (providerCheckoutRef) attempt.providerCheckoutRef = providerCheckoutRef
    return finished
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
