import { ENFORCEMENT_DECISION, OVERAGE_POLICY, QUOTA_STATUS, RESERVATION_STATUS } from './catalog.js'
import { evaluateBillingOperation } from './enforcementOrchestrator.js'
import {
  classifyFoodScanProviderOutcome,
  createBillingAccountingIdentity,
  FOOD_SCAN_CANARY,
  foodScanUsageEventPlan,
  PROVIDER_DISPATCH_STATE,
  sanitizeLifecycleError,
  stripSensitiveBillingPayload,
} from './foodScanCanary.js'
import { QUOTA_PLAN_ACTION } from './quotaReservationPlan.js'

export const LIFECYCLE_OUTCOME = Object.freeze({
  ABORTED: 'ABORTED',
  ALREADY_COMPLETED: 'ALREADY_COMPLETED',
  AMBIGUOUS_BILLING: 'AMBIGUOUS_BILLING',
  COMMIT_FAILED: 'COMMIT_FAILED',
  DENIED_EVALUATE: 'DENIED_EVALUATE',
  DENIED_RESERVE: 'DENIED_RESERVE',
  PROVIDER_FAILED: 'PROVIDER_FAILED',
  RETRY_REQUIRES_NEW_OPERATION: 'RETRY_REQUIRES_NEW_OPERATION',
  SUCCEEDED: 'SUCCEEDED',
  TIMED_OUT: 'TIMED_OUT',
  USAGE_EVENT_FAILED: 'USAGE_EVENT_FAILED',
})

const inflight = new Map()
const ledger = new Map()

export function resetMeteredLifecycleInflightForTests() {
  inflight.clear()
  ledger.clear()
}

export function getMeteredLifecycleLedgerForTests(operationId) {
  return ledger.get(operationId) || null
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

function identityFields(operationId) {
  const identity = createBillingAccountingIdentity(operationId) || {
    event_id: operationId,
    operation_id: operationId,
    reservation_id: operationId,
  }
  return {
    event_id: identity.event_id,
    operation_id: identity.operation_id,
    reservation_id: identity.reservation_id,
  }
}

function remember(operationId, patch) {
  const prev = ledger.get(operationId) || {}
  const next = { ...prev, ...patch, ...identityFields(operationId) }
  ledger.set(operationId, next)
  return next
}

function isCommittedStatus(status) {
  return status === QUOTA_STATUS.COMMITTED || status === RESERVATION_STATUS.COMMITTED
}

function isRolledBackStatus(status) {
  return status === QUOTA_STATUS.ROLLED_BACK || status === RESERVATION_STATUS.ROLLED_BACK
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

function safeResult(fields) {
  return Object.freeze(stripSensitiveBillingPayload({
    already_completed: fields.already_completed === true,
    allowed: fields.allowed === true,
    calls: Object.freeze({ ...(fields.calls || emptyCounts()) }),
    decision: fields.decision || null,
    dispatch_state: fields.dispatch_state || fields.provider_billing_class || null,
    event_id: fields.event_id || fields.operation_id || null,
    feature_id: fields.feature_id || FOOD_SCAN_CANARY.feature_id,
    live_wired: false,
    needs_recovery: fields.needs_recovery === true,
    operation_id: fields.operation_id || null,
    order: Object.freeze([...(fields.order || [])]),
    outcome: fields.outcome,
    overage_policy: OVERAGE_POLICY,
    provider_blocked: fields.provider_blocked === true,
    provider_billing_class: fields.provider_billing_class || fields.dispatch_state || null,
    quota_consumed: fields.quota_consumed === true,
    reservation_id: fields.reservation_id || null,
    safe_error: fields.safe_error ? sanitizeLifecycleError(fields.safe_error) : null,
    warnings: Object.freeze([...(fields.warnings || [])]),
  }))
}

function mapTimeoutAbort(result) {
  if (result?.timeout === true || result?.code === 'timeout') return LIFECYCLE_OUTCOME.TIMED_OUT
  if (result?.aborted === true || result?.code === 'requestAborted') return LIFECYCLE_OUTCOME.ABORTED
  return LIFECYCLE_OUTCOME.PROVIDER_FAILED
}

function canRollback(dispatchState) {
  return dispatchState === PROVIDER_DISPATCH_STATE.NOT_DISPATCHED
    || dispatchState === PROVIDER_DISPATCH_STATE.DISPATCHED_CONFIRMED_FAILURE_NOT_BILLABLE
}

async function writeUsage({ calls, operationId, order, recordUsage, userId }) {
  if (typeof recordUsage !== 'function') return { ok: true, skipped: true }
  calls.usage += 1
  order.push('usage')
  const result = await recordUsage(foodScanUsageEventPlan({ operationId, userId }))
  if (result && result.ok === false) return result
  return { ok: true, duplicate: result?.duplicate === true }
}

async function recoverLedger({
  commit,
  operationId,
  recordUsage,
  row,
  userId,
}) {
  const calls = emptyCounts()
  const order = ['idempotent']
  const ids = identityFields(operationId)

  if (row.rolled_back === true && row.dispatch_state === PROVIDER_DISPATCH_STATE.NOT_DISPATCHED) {
    return safeResult({
      ...ids,
      allowed: false,
      calls,
      decision: ENFORCEMENT_DECISION.DENY_QUOTA,
      dispatch_state: PROVIDER_DISPATCH_STATE.NOT_DISPATCHED,
      order,
      outcome: LIFECYCLE_OUTCOME.RETRY_REQUIRES_NEW_OPERATION,
      provider_blocked: true,
      safe_error: { code: LIFECYCLE_OUTCOME.RETRY_REQUIRES_NEW_OPERATION },
    })
  }

  if (row.quota_committed === true && row.usage_ok !== false) {
    return safeResult({
      ...ids,
      already_completed: true,
      allowed: true,
      calls,
      decision: ENFORCEMENT_DECISION.ALLOW,
      dispatch_state: row.dispatch_state,
      order,
      outcome: row.outcome === LIFECYCLE_OUTCOME.AMBIGUOUS_BILLING
        ? LIFECYCLE_OUTCOME.AMBIGUOUS_BILLING
        : LIFECYCLE_OUTCOME.ALREADY_COMPLETED,
      provider_blocked: true,
      quota_consumed: true,
    })
  }

  if (row.dispatch_started === true || row.dispatch_state === PROVIDER_DISPATCH_STATE.DISPATCHED_BILLING_UNKNOWN) {
    if (row.quota_committed !== true && typeof commit === 'function') {
      calls.commit += 1
      order.push('commit')
      const committed = await commit({
        actual_quantity: FOOD_SCAN_CANARY.quantity,
        reservation_id: ids.reservation_id,
      })
      if (!isCommittedStatus(committed?.status)) {
        remember(operationId, {
          dispatch_started: true,
          dispatch_state: PROVIDER_DISPATCH_STATE.DISPATCHED_BILLING_UNKNOWN,
          needs_recovery: true,
          outcome: LIFECYCLE_OUTCOME.COMMIT_FAILED,
          quota_committed: false,
        })
        return safeResult({
          ...ids,
          allowed: false,
          calls,
          decision: ENFORCEMENT_DECISION.ALLOW,
          dispatch_state: PROVIDER_DISPATCH_STATE.DISPATCHED_BILLING_UNKNOWN,
          needs_recovery: true,
          order,
          outcome: LIFECYCLE_OUTCOME.COMMIT_FAILED,
          provider_blocked: true,
          safe_error: { code: LIFECYCLE_OUTCOME.COMMIT_FAILED },
        })
      }
      remember(operationId, { quota_committed: true })
    }

    if (row.usage_ok !== true) {
      const usage = await writeUsage({
        calls,
        operationId,
        order,
        recordUsage,
        userId,
      })
      if (usage.ok !== true && usage.skipped !== true) {
        remember(operationId, {
          dispatch_started: true,
          needs_recovery: true,
          outcome: LIFECYCLE_OUTCOME.USAGE_EVENT_FAILED,
          quota_committed: true,
          usage_ok: false,
        })
        return safeResult({
          ...ids,
          allowed: false,
          calls,
          decision: ENFORCEMENT_DECISION.ALLOW,
          dispatch_state: row.dispatch_state || PROVIDER_DISPATCH_STATE.DISPATCHED_BILLING_UNKNOWN,
          needs_recovery: true,
          order,
          outcome: LIFECYCLE_OUTCOME.USAGE_EVENT_FAILED,
          provider_blocked: true,
          quota_consumed: true,
          safe_error: { code: LIFECYCLE_OUTCOME.USAGE_EVENT_FAILED },
        })
      }
      remember(operationId, { usage_ok: true, needs_recovery: false })
    }

    return safeResult({
      ...ids,
      already_completed: true,
      allowed: true,
      calls,
      decision: ENFORCEMENT_DECISION.ALLOW,
      dispatch_state: row.dispatch_state || PROVIDER_DISPATCH_STATE.DISPATCHED_BILLING_UNKNOWN,
      order,
      outcome: LIFECYCLE_OUTCOME.ALREADY_COMPLETED,
      provider_blocked: true,
      quota_consumed: true,
    })
  }

  return null
}

/**
 * Isolated BILL-5B1/5B1a adapter. Not imported by live routes.
 * Order: evaluate → reserve → dispatch marker (inside provider hook) →
 * provider → commit → usage | rollback.
 * Quota commit always precedes the usage event.
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
  if (!scopedId || !createBillingAccountingIdentity(scopedId)) {
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
  const prior = ledger.get(operationId)
  if (prior) {
    const recovered = await recoverLedger({
      commit,
      operationId,
      recordUsage,
      row: prior,
      userId: evaluateInput.userId,
    })
    if (recovered) return recovered
  }

  const calls = emptyCounts()
  const order = []
  const ids = identityFields(operationId)
  const featureId = evaluateInput.featureId || FOOD_SCAN_CANARY.feature_id
  const userId = evaluateInput.userId

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
    remember(operationId, { outcome: LIFECYCLE_OUTCOME.DENIED_EVALUATE })
    return safeResult({
      ...ids,
      allowed: false,
      calls,
      decision: decision?.decision || ENFORCEMENT_DECISION.DENY_INTERNAL,
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
        ...ids,
        allowed: false,
        calls,
        decision: ENFORCEMENT_DECISION.DENY_INTERNAL,
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
      reservation_id: ids.reservation_id,
      unit,
      user: userId,
    })
    if (isCommittedStatus(reserveResult?.status)) {
      remember(operationId, {
        dispatch_state: PROVIDER_DISPATCH_STATE.DISPATCHED_CONFIRMED_SUCCESS,
        outcome: LIFECYCLE_OUTCOME.SUCCEEDED,
        quota_committed: true,
        usage_ok: true,
      })
      return safeResult({
        ...ids,
        already_completed: true,
        allowed: true,
        calls,
        decision: ENFORCEMENT_DECISION.ALLOW,
        dispatch_state: PROVIDER_DISPATCH_STATE.DISPATCHED_CONFIRMED_SUCCESS,
        order,
        outcome: LIFECYCLE_OUTCOME.ALREADY_COMPLETED,
        provider_blocked: true,
        quota_consumed: true,
        warnings: decision.warnings,
      })
    }
    if (isRolledBackStatus(reserveResult?.status)) {
      remember(operationId, {
        dispatch_state: PROVIDER_DISPATCH_STATE.NOT_DISPATCHED,
        outcome: LIFECYCLE_OUTCOME.RETRY_REQUIRES_NEW_OPERATION,
        rolled_back: true,
      })
      return safeResult({
        ...ids,
        allowed: false,
        calls,
        decision: ENFORCEMENT_DECISION.DENY_QUOTA,
        dispatch_state: PROVIDER_DISPATCH_STATE.NOT_DISPATCHED,
        order,
        outcome: LIFECYCLE_OUTCOME.RETRY_REQUIRES_NEW_OPERATION,
        provider_blocked: true,
        safe_error: { code: 'RESERVATION_TERMINAL' },
        warnings: decision.warnings,
      })
    }
    if (!reserveOk(reserveResult?.status)) {
      remember(operationId, { outcome: LIFECYCLE_OUTCOME.DENIED_RESERVE })
      return safeResult({
        ...ids,
        allowed: false,
        calls,
        decision: ENFORCEMENT_DECISION.DENY_QUOTA,
        order,
        outcome: LIFECYCLE_OUTCOME.DENIED_RESERVE,
        safe_error: { code: ENFORCEMENT_DECISION.DENY_QUOTA },
        warnings: decision.warnings,
      })
    }
    reservationId = reserveResult.reservation_id || ids.reservation_id
  }

  if (typeof executeProvider !== 'function') {
    if (reservationId && typeof rollback === 'function') {
      calls.rollback += 1
      order.push('rollback')
      await rollback({ reservation_id: reservationId })
    }
    remember(operationId, {
      dispatch_started: false,
      dispatch_state: PROVIDER_DISPATCH_STATE.NOT_DISPATCHED,
      outcome: LIFECYCLE_OUTCOME.PROVIDER_FAILED,
      rolled_back: true,
    })
    return safeResult({
      ...ids,
      allowed: false,
      calls,
      decision: ENFORCEMENT_DECISION.DENY_INTERNAL,
      dispatch_state: PROVIDER_DISPATCH_STATE.NOT_DISPATCHED,
      order,
      outcome: LIFECYCLE_OUTCOME.PROVIDER_FAILED,
      reservation_id: reservationId,
      safe_error: { code: ENFORCEMENT_DECISION.DENY_INTERNAL },
      warnings: decision.warnings,
    })
  }

  let dispatchStarted = false
  const markDispatched = () => {
    dispatchStarted = true
  }

  let providerResult
  try {
    calls.provider += 1
    order.push('provider')
    providerResult = await executeProvider({ markDispatched })
  } catch (error) {
    providerResult = {
      aborted: error?.aborted === true || error?.code === 'requestAborted',
      code: error?.code,
      ok: false,
      providerRequestStarted: error?.providerRequestStarted,
      timeout: error?.timeout === true || error?.code === 'timeout',
    }
  }

  const dispatchState = classifyFoodScanProviderOutcome(providerResult, dispatchStarted)

  if (providerResult?.ok !== true) {
    const failureOutcome = mapTimeoutAbort(providerResult)
    const outcome = dispatchState === PROVIDER_DISPATCH_STATE.DISPATCHED_BILLING_UNKNOWN
      ? LIFECYCLE_OUTCOME.AMBIGUOUS_BILLING
      : failureOutcome

    if (canRollback(dispatchState)) {
      if (reservationId && typeof rollback === 'function') {
        calls.rollback += 1
        order.push('rollback')
        await rollback({ reservation_id: reservationId })
      }
      remember(operationId, {
        dispatch_started: false,
        dispatch_state: dispatchState,
        outcome,
        rolled_back: true,
      })
      return safeResult({
        ...ids,
        allowed: false,
        calls,
        decision: ENFORCEMENT_DECISION.ALLOW,
        dispatch_state: dispatchState,
        order,
        outcome: mapTimeoutAbort(providerResult),
        reservation_id: reservationId,
        safe_error: { code: mapTimeoutAbort(providerResult) },
        warnings: decision.warnings,
      })
    }

    remember(operationId, {
      dispatch_started: true,
      dispatch_state: PROVIDER_DISPATCH_STATE.DISPATCHED_BILLING_UNKNOWN,
      outcome: LIFECYCLE_OUTCOME.AMBIGUOUS_BILLING,
    })

    if (reservationId && typeof commit === 'function') {
      calls.commit += 1
      order.push('commit')
      const committed = await commit({
        actual_quantity: quantity,
        reservation_id: reservationId,
      })
      if (!isCommittedStatus(committed?.status)) {
        remember(operationId, {
          dispatch_started: true,
          needs_recovery: true,
          outcome: LIFECYCLE_OUTCOME.COMMIT_FAILED,
          quota_committed: false,
        })
        return safeResult({
          ...ids,
          allowed: false,
          calls,
          decision: ENFORCEMENT_DECISION.ALLOW,
          dispatch_state: PROVIDER_DISPATCH_STATE.DISPATCHED_BILLING_UNKNOWN,
          needs_recovery: true,
          order,
          outcome: LIFECYCLE_OUTCOME.COMMIT_FAILED,
          provider_blocked: true,
          reservation_id: reservationId,
          safe_error: { code: LIFECYCLE_OUTCOME.COMMIT_FAILED },
          warnings: decision.warnings,
        })
      }
      remember(operationId, { quota_committed: true })
    }

    const usage = await writeUsage({
      calls,
      operationId,
      order,
      recordUsage,
      userId,
    })
    if (usage.ok !== true && usage.skipped !== true) {
      remember(operationId, {
        needs_recovery: true,
        outcome: LIFECYCLE_OUTCOME.USAGE_EVENT_FAILED,
        quota_committed: true,
        usage_ok: false,
      })
      return safeResult({
        ...ids,
        allowed: false,
        calls,
        decision: ENFORCEMENT_DECISION.ALLOW,
        dispatch_state: PROVIDER_DISPATCH_STATE.DISPATCHED_BILLING_UNKNOWN,
        needs_recovery: true,
        order,
        outcome: LIFECYCLE_OUTCOME.USAGE_EVENT_FAILED,
        provider_blocked: true,
        quota_consumed: Boolean(reservationId),
        reservation_id: reservationId,
        safe_error: { code: LIFECYCLE_OUTCOME.USAGE_EVENT_FAILED },
        warnings: decision.warnings,
      })
    }
    remember(operationId, { usage_ok: usage.skipped ? null : true, needs_recovery: false })

    return safeResult({
      ...ids,
      allowed: false,
      calls,
      decision: ENFORCEMENT_DECISION.ALLOW,
      dispatch_state: PROVIDER_DISPATCH_STATE.DISPATCHED_BILLING_UNKNOWN,
      order,
      outcome,
      provider_blocked: true,
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
    if (!isCommittedStatus(committed?.status)) {
      remember(operationId, {
        dispatch_started: true,
        dispatch_state: PROVIDER_DISPATCH_STATE.DISPATCHED_CONFIRMED_SUCCESS,
        needs_recovery: true,
        outcome: LIFECYCLE_OUTCOME.COMMIT_FAILED,
        quota_committed: false,
      })
      return safeResult({
        ...ids,
        allowed: false,
        calls,
        decision: ENFORCEMENT_DECISION.ALLOW,
        dispatch_state: PROVIDER_DISPATCH_STATE.DISPATCHED_CONFIRMED_SUCCESS,
        needs_recovery: true,
        order,
        outcome: LIFECYCLE_OUTCOME.COMMIT_FAILED,
        provider_blocked: true,
        reservation_id: reservationId,
        safe_error: { code: LIFECYCLE_OUTCOME.COMMIT_FAILED },
        warnings: decision.warnings,
      })
    }
    remember(operationId, { quota_committed: true })
  }

  const usage = await writeUsage({
    calls,
    operationId,
    order,
    recordUsage,
    userId,
  })
  if (usage.ok !== true && usage.skipped !== true) {
    remember(operationId, {
      dispatch_started: true,
      dispatch_state: PROVIDER_DISPATCH_STATE.DISPATCHED_CONFIRMED_SUCCESS,
      needs_recovery: true,
      outcome: LIFECYCLE_OUTCOME.USAGE_EVENT_FAILED,
      quota_committed: true,
      usage_ok: false,
    })
    return safeResult({
      ...ids,
      allowed: false,
      calls,
      decision: ENFORCEMENT_DECISION.ALLOW,
      dispatch_state: PROVIDER_DISPATCH_STATE.DISPATCHED_CONFIRMED_SUCCESS,
      needs_recovery: true,
      order,
      outcome: LIFECYCLE_OUTCOME.USAGE_EVENT_FAILED,
      provider_blocked: true,
      quota_consumed: Boolean(reservationId),
      reservation_id: reservationId,
      safe_error: { code: LIFECYCLE_OUTCOME.USAGE_EVENT_FAILED },
      warnings: decision.warnings,
    })
  }

  remember(operationId, {
    dispatch_started: true,
    dispatch_state: PROVIDER_DISPATCH_STATE.DISPATCHED_CONFIRMED_SUCCESS,
    outcome: LIFECYCLE_OUTCOME.SUCCEEDED,
    quota_committed: true,
    usage_ok: usage.skipped ? true : true,
  })

  return safeResult({
    ...ids,
    allowed: true,
    calls,
    decision: ENFORCEMENT_DECISION.ALLOW,
    dispatch_state: PROVIDER_DISPATCH_STATE.DISPATCHED_CONFIRMED_SUCCESS,
    order,
    outcome: LIFECYCLE_OUTCOME.SUCCEEDED,
    quota_consumed: Boolean(reservationId),
    reservation_id: reservationId,
    warnings: decision.warnings,
  })
}
