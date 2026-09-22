import { ENFORCEMENT_DECISION, OVERAGE_POLICY, QUOTA_STATUS, RESERVATION_STATUS } from './catalog.js'
import { evaluateBillingOperation } from './enforcementOrchestrator.js'
import {
  classifyFoodScanProviderOutcome,
  FOOD_SCAN_CANARY,
  PROVIDER_BILLING_CLASS,
  stripSensitiveBillingPayload,
} from './foodScanCanary.js'
import { QUOTA_PLAN_ACTION } from './quotaReservationPlan.js'

export const LIFECYCLE_OUTCOME = Object.freeze({
  ABORTED: 'ABORTED',
  COMMIT_FAILED: 'COMMIT_FAILED',
  DENIED_EVALUATE: 'DENIED_EVALUATE',
  DENIED_RESERVE: 'DENIED_RESERVE',
  PROVIDER_FAILED: 'PROVIDER_FAILED',
  SUCCEEDED: 'SUCCEEDED',
  TIMED_OUT: 'TIMED_OUT',
})

const inflight = new Map()

export function resetMeteredLifecycleInflightForTests() {
  inflight.clear()
}

function emptyCounts() {
  return {
    commit: 0,
    evaluate: 0,
    provider: 0,
    reserve: 0,
    rollback: 0,
    usage: 0,
  }
}

function safeResult(fields) {
  return Object.freeze(stripSensitiveBillingPayload({
    allowed: fields.allowed === true,
    decision: fields.decision || null,
    feature_id: fields.feature_id || FOOD_SCAN_CANARY.feature_id,
    live_wired: false,
    needs_recovery: fields.needs_recovery === true,
    operation_id: fields.operation_id || null,
    order: Object.freeze([...(fields.order || [])]),
    outcome: fields.outcome,
    overage_policy: OVERAGE_POLICY,
    provider_billing_class: fields.provider_billing_class || null,
    quota_consumed: fields.quota_consumed === true,
    reservation_id: fields.reservation_id || null,
    safe_error: fields.safe_error || null,
    warnings: Object.freeze([...(fields.warnings || [])]),
    calls: Object.freeze({ ...(fields.calls || emptyCounts()) }),
  }))
}

function mapTimeoutAbort(result) {
  if (result?.timeout === true || result?.code === 'timeout') return LIFECYCLE_OUTCOME.TIMED_OUT
  if (result?.aborted === true || result?.code === 'requestAborted') return LIFECYCLE_OUTCOME.ABORTED
  return LIFECYCLE_OUTCOME.PROVIDER_FAILED
}

function reserveOk(status) {
  return [
    QUOTA_STATUS.RESERVED,
    QUOTA_STATUS.UNLIMITED,
    QUOTA_STATUS.ALLOWED_UNMETERED,
    QUOTA_STATUS.COMMITTED,
    RESERVATION_STATUS.COMMITTED,
  ].includes(status)
}

/**
 * Isolated BILL-5B1 adapter. Not imported by live routes.
 * Order: evaluate → reserve → provider → commit | rollback.
 */
export async function executeMeteredBillingOperation({
  clientClaim = {},
  commit,
  evaluate = evaluateBillingOperation,
  evaluateInput = {},
  executeProvider,
  log = () => {},
  operationId,
  recordUsage,
  reserve,
  rollback,
  unit = FOOD_SCAN_CANARY.unit,
  quantity = FOOD_SCAN_CANARY.quantity,
} = {}) {
  void clientClaim.plan_id
  void clientClaim.remaining
  void clientClaim.costSafe
  void clientClaim.feature
  void clientClaim.quantity

  const scopedId = String(operationId || '').trim()
  if (!scopedId) {
    return safeResult({
      outcome: LIFECYCLE_OUTCOME.DENIED_EVALUATE,
      decision: ENFORCEMENT_DECISION.INVALID_OPERATION,
      safe_error: { code: 'INVALID_OPERATION' },
    })
  }

  if (inflight.has(scopedId)) return inflight.get(scopedId)

  const run = runLifecycle({
    clientClaim,
    commit,
    evaluate,
    evaluateInput,
    executeProvider,
    log,
    operationId: scopedId,
    quantity,
    recordUsage,
    reserve,
    rollback,
    unit,
  })
  inflight.set(scopedId, run)
  try {
    return await run
  } finally {
    inflight.delete(scopedId)
  }
}

async function runLifecycle({
  clientClaim,
  commit,
  evaluate,
  evaluateInput,
  executeProvider,
  log,
  operationId,
  quantity,
  recordUsage,
  reserve,
  rollback,
  unit,
}) {
  const calls = emptyCounts()
  const order = []
  const featureId = evaluateInput.featureId || FOOD_SCAN_CANARY.feature_id

  calls.evaluate += 1
  order.push('evaluate')
  const decision = await evaluate({
    ...evaluateInput,
    clientClaim,
    featureId,
    quantity,
  })
  log({ event: 'evaluate', feature_id: featureId, operation_id: operationId })

  if (!decision?.allowed) {
    return safeResult({
      allowed: false,
      calls,
      decision: decision?.decision || ENFORCEMENT_DECISION.DENY_INTERNAL,
      feature_id: featureId,
      operation_id: operationId,
      order,
      outcome: LIFECYCLE_OUTCOME.DENIED_EVALUATE,
      safe_error: { code: decision?.decision || ENFORCEMENT_DECISION.DENY_INTERNAL },
      warnings: decision?.warnings || [],
    })
  }

  const needsReserve = decision.quota_plan?.action === QUOTA_PLAN_ACTION.RESERVE_ON_EXECUTE
  let reservationId = null

  if (needsReserve) {
    if (typeof reserve !== 'function') {
      return safeResult({
        allowed: false,
        calls,
        decision: ENFORCEMENT_DECISION.DENY_INTERNAL,
        feature_id: featureId,
        operation_id: operationId,
        order,
        outcome: LIFECYCLE_OUTCOME.DENIED_RESERVE,
        safe_error: { code: ENFORCEMENT_DECISION.DENY_INTERNAL },
        warnings: decision.warnings,
      })
    }
    calls.reserve += 1
    order.push('reserve')
    const reserveResult = await reserve({
      clientClaim: {},
      feature: featureId,
      quantity,
      reservation_id: operationId,
      unit,
      user: evaluateInput.userId,
    })
    if (reserveResult?.status === QUOTA_STATUS.COMMITTED || reserveResult?.status === RESERVATION_STATUS.COMMITTED) {
      return safeResult({
        allowed: true,
        calls,
        decision: ENFORCEMENT_DECISION.ALLOW,
        feature_id: featureId,
        operation_id: operationId,
        order,
        outcome: LIFECYCLE_OUTCOME.SUCCEEDED,
        quota_consumed: true,
        reservation_id: reserveResult.reservation_id || operationId,
        warnings: decision.warnings,
      })
    }
    if (reserveResult?.status === RESERVATION_STATUS.ROLLED_BACK || reserveResult?.status === QUOTA_STATUS.ROLLED_BACK) {
      return safeResult({
        allowed: false,
        calls,
        decision: ENFORCEMENT_DECISION.DENY_QUOTA,
        feature_id: featureId,
        operation_id: operationId,
        order,
        outcome: LIFECYCLE_OUTCOME.DENIED_RESERVE,
        reservation_id: reserveResult.reservation_id || operationId,
        safe_error: { code: 'RESERVATION_TERMINAL' },
        warnings: decision.warnings,
      })
    }
    if (!reserveOk(reserveResult?.status)) {
      return safeResult({
        allowed: false,
        calls,
        decision: ENFORCEMENT_DECISION.DENY_QUOTA,
        feature_id: featureId,
        operation_id: operationId,
        order,
        outcome: LIFECYCLE_OUTCOME.DENIED_RESERVE,
        safe_error: { code: ENFORCEMENT_DECISION.DENY_QUOTA },
        warnings: decision.warnings,
      })
    }
    reservationId = reserveResult.reservation_id || operationId
  }

  if (typeof executeProvider !== 'function') {
    if (reservationId && typeof rollback === 'function') {
      calls.rollback += 1
      order.push('rollback')
      await rollback({ reservation_id: reservationId })
    }
    return safeResult({
      allowed: false,
      calls,
      decision: ENFORCEMENT_DECISION.DENY_INTERNAL,
      feature_id: featureId,
      operation_id: operationId,
      order,
      outcome: LIFECYCLE_OUTCOME.PROVIDER_FAILED,
      provider_billing_class: PROVIDER_BILLING_CLASS.NOT_STARTED,
      reservation_id: reservationId,
      safe_error: { code: ENFORCEMENT_DECISION.DENY_INTERNAL },
      warnings: decision.warnings,
    })
  }

  let providerResult
  try {
    calls.provider += 1
    order.push('provider')
    providerResult = await executeProvider()
  } catch (error) {
    providerResult = {
      aborted: error?.aborted === true || error?.code === 'requestAborted',
      code: error?.code,
      ok: false,
      providerRequestStarted: error?.providerRequestStarted,
      timeout: error?.timeout === true || error?.code === 'timeout',
    }
  }

  const billingClass = classifyFoodScanProviderOutcome(providerResult)
  if (providerResult?.ok !== true) {
    const outcome = mapTimeoutAbort(providerResult)
    if (billingClass === PROVIDER_BILLING_CLASS.NOT_STARTED) {
      if (reservationId && typeof rollback === 'function') {
        calls.rollback += 1
        order.push('rollback')
        await rollback({ reservation_id: reservationId })
      }
      return safeResult({
        allowed: false,
        calls,
        decision: ENFORCEMENT_DECISION.ALLOW,
        feature_id: featureId,
        operation_id: operationId,
        order,
        outcome,
        provider_billing_class: billingClass,
        reservation_id: reservationId,
        safe_error: { code: outcome },
        warnings: decision.warnings,
      })
    }

    if (reservationId && typeof commit === 'function') {
      calls.commit += 1
      order.push('commit')
      const committed = await commit({
        actual_quantity: quantity,
        reservation_id: reservationId,
      })
      if (committed?.status !== QUOTA_STATUS.COMMITTED && committed?.status !== RESERVATION_STATUS.COMMITTED) {
        return safeResult({
          allowed: false,
          calls,
          decision: ENFORCEMENT_DECISION.ALLOW,
          feature_id: featureId,
          needs_recovery: true,
          operation_id: operationId,
          order,
          outcome: LIFECYCLE_OUTCOME.COMMIT_FAILED,
          provider_billing_class: billingClass,
          reservation_id: reservationId,
          safe_error: { code: LIFECYCLE_OUTCOME.COMMIT_FAILED },
          warnings: decision.warnings,
        })
      }
    }
    return safeResult({
      allowed: false,
      calls,
      decision: ENFORCEMENT_DECISION.ALLOW,
      feature_id: featureId,
      operation_id: operationId,
      order,
      outcome,
      provider_billing_class: billingClass,
      quota_consumed: Boolean(reservationId),
      reservation_id: reservationId,
      safe_error: { code: outcome },
      warnings: decision.warnings,
    })
  }

  if (reservationId && typeof commit === 'function') {
    calls.commit += 1
    order.push('commit')
    const committed = await commit({
      actual_quantity: quantity,
      reservation_id: reservationId,
    })
    if (committed?.status !== QUOTA_STATUS.COMMITTED && committed?.status !== RESERVATION_STATUS.COMMITTED) {
      return safeResult({
        allowed: false,
        calls,
        decision: ENFORCEMENT_DECISION.ALLOW,
        feature_id: featureId,
        needs_recovery: true,
        operation_id: operationId,
        order,
        outcome: LIFECYCLE_OUTCOME.COMMIT_FAILED,
        provider_billing_class: PROVIDER_BILLING_CLASS.COMPLETED,
        reservation_id: reservationId,
        safe_error: { code: LIFECYCLE_OUTCOME.COMMIT_FAILED },
        warnings: decision.warnings,
      })
    }
  }

  if (typeof recordUsage === 'function') {
    calls.usage += 1
    await recordUsage({ event_id: operationId, reservation_id: reservationId || operationId })
  }

  return safeResult({
    allowed: true,
    calls,
    decision: ENFORCEMENT_DECISION.ALLOW,
    feature_id: featureId,
    operation_id: operationId,
    order,
    outcome: LIFECYCLE_OUTCOME.SUCCEEDED,
    provider_billing_class: PROVIDER_BILLING_CLASS.COMPLETED,
    quota_consumed: Boolean(reservationId),
    reservation_id: reservationId,
    warnings: decision.warnings,
  })
}
