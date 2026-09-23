import { aiRouteErrorCodes } from '../aiRouteErrors.js'
import { createSupabaseAdminClient } from '../supabaseServer.js'
import { ENFORCEMENT_DECISION } from '../../../src/services/billing/catalog.js'
import {
  createFoodScanDurableDispatchStore,
  FOOD_SCAN_RECOVERY_HTTP,
} from '../../../src/services/billing/durableOperationStore.js'
import { evaluateBillingOperation } from '../../../src/services/billing/enforcementOrchestrator.js'
import {
  createBillingAccountingIdentity,
  createScopedOperationId,
  FOOD_SCAN_CANARY,
  IMAGE_DEDUP_ROLE,
} from '../../../src/services/billing/foodScanCanary.js'
import {
  executeDurableMeteredBillingOperation,
  LIFECYCLE_OUTCOME,
} from '../../../src/services/billing/meteredOperationLifecycle.js'
import { createQuotaEngine } from '../../../src/services/billing/quotaEngine.js'
import {
  createPostgresQuotaBackend,
  createSupabaseBillingRpcQuery,
} from '../../../src/services/billing/quotaPostgres.js'
import { recordUsageEvent } from '../../../src/services/billing/recordUsage.js'
import { createInMemoryUsageRepository } from '../../../src/services/billing/usageRepository.js'
import { createPostgresUsageRepository } from '../../../src/services/billing/usageRepositoryPostgres.js'

let testRuntimeOverride = null

export function setFoodScanBillingRuntimeForTests(runtime = null) {
  testRuntimeOverride = runtime
}

export function installFoodScanBillingTestRuntime(overrides = {}) {
  const usageRepository = overrides.usageRepository || createInMemoryUsageRepository()
  const quota = overrides.quota || createQuotaEngine({ usageRepository })
  const runtime = createFoodScanCanaryRuntime({
    evaluate: overrides.evaluate,
    featureControl: overrides.featureControl ?? null,
    providerControls: overrides.providerControls ?? [],
    quota,
    selectedThresholds: overrides.selectedThresholds ?? [],
    summariesByKey: overrides.summariesByKey ?? {},
    usageRepository,
  })
  setFoodScanBillingRuntimeForTests(runtime)
  return runtime
}

export function createFoodScanCanaryRuntime({
  evaluate = null,
  featureControl = null,
  providerControls = [],
  quota,
  selectedThresholds = [],
  summariesByKey = {},
  usageRepository,
} = {}) {
  if (!usageRepository || typeof quota?.reserveQuota !== 'function') {
    return { ok: false, code: 'DURABLE_STORE_UNAVAILABLE' }
  }
  const recordUsage = (input) => recordUsageEvent(input, usageRepository)
  let operationStore
  try {
    operationStore = createFoodScanDurableDispatchStore({ recordUsage, usageRepository })
  } catch {
    return { ok: false, code: 'DURABLE_STORE_UNAVAILABLE' }
  }
  return {
    evaluate,
    featureControl,
    ok: true,
    operationStore,
    providerControls,
    quota,
    recordUsage,
    selectedThresholds,
    summariesByKey,
    usageRepository,
  }
}

async function readControlRow(client, table, column, value) {
  const { data, error } = await client.schema('billing').from(table).select('*').eq(column, value).maybeSingle()
  if (error) {
    const wrapped = new Error(error.message || 'control_load_failed')
    wrapped.code = error.code || 'control_load_failed'
    throw wrapped
  }
  return data || null
}

export async function loadFoodScanOperationalControls(client) {
  const featureControl = await readControlRow(client, 'feature_controls', 'feature_id', FOOD_SCAN_CANARY.feature_id)
  const providerRow = await readControlRow(client, 'provider_controls', 'provider_id', FOOD_SCAN_CANARY.provider_id)
  return {
    featureControl,
    providerControls: providerRow ? [providerRow] : [],
  }
}

export async function resolveFoodScanBillingRuntime() {
  if (testRuntimeOverride) return testRuntimeOverride
  const client = createSupabaseAdminClient()
  if (!client) return { ok: false, code: 'DURABLE_STORE_UNAVAILABLE' }
  try {
    const usageRepository = createPostgresUsageRepository({ client })
    const quota = createQuotaEngine({
      backend: createPostgresQuotaBackend(createSupabaseBillingRpcQuery(client)),
    })
    const controls = await loadFoodScanOperationalControls(client)
    return createFoodScanCanaryRuntime({
      usageRepository,
      quota,
      ...controls,
    })
  } catch {
    return { ok: false, code: 'DURABLE_STORE_UNAVAILABLE' }
  }
}

export function createFoodScanOperationId({ clientAttemptId, userId }) {
  return createScopedOperationId({
    clientAttemptId,
    featureId: FOOD_SCAN_CANARY.feature_id,
    route: FOOD_SCAN_CANARY.route,
    userId,
  })
}

export function mapFoodScanBillingHttp(result = {}, {
  analysisOk = false,
  providerAttempted = false,
  timeout = false,
} = {}) {
  if (result.outcome === LIFECYCLE_OUTCOME.SUCCEEDED && result.allowed === true && analysisOk) {
    return { kind: 'success' }
  }

  const decision = result.decision
  if (decision === ENFORCEMENT_DECISION.DENY_AUTH) {
    return { code: aiRouteErrorCodes.AUTH_REQUIRED, kind: 'error', retryable: false, status: 401 }
  }
  if ([
    ENFORCEMENT_DECISION.DENY_FEATURE_DISABLED,
    ENFORCEMENT_DECISION.DENY_FEATURE_MAINTENANCE,
    ENFORCEMENT_DECISION.DENY_PROVIDER_UNAVAILABLE,
    ENFORCEMENT_DECISION.DENY_PROVIDER_MAINTENANCE,
    ENFORCEMENT_DECISION.DENY_ENTITLEMENT,
    ENFORCEMENT_DECISION.DENY_COST_HARD_STOP,
    ENFORCEMENT_DECISION.DENY_COST_UNAVAILABLE,
  ].includes(decision)) {
    return { code: aiRouteErrorCodes.SAFETY_BLOCKED, kind: 'error', retryable: false, status: 403 }
  }
  if (decision === ENFORCEMENT_DECISION.DENY_QUOTA || result.outcome === LIFECYCLE_OUTCOME.DENIED_RESERVE) {
    return { code: aiRouteErrorCodes.RATE_LIMITED, kind: 'error', retryable: true, status: 429 }
  }
  if (result.outcome === LIFECYCLE_OUTCOME.PERSISTENCE_FAILURE) {
    return {
      code: aiRouteErrorCodes.PROVIDER_UNAVAILABLE,
      kind: 'error',
      retryable: true,
      status: FOOD_SCAN_RECOVERY_HTTP.PERSISTENCE_FAILURE.status,
    }
  }
  if (result.outcome === LIFECYCLE_OUTCOME.ALREADY_COMPLETED || (result.provider_blocked === true && !providerAttempted)) {
    return {
      code: aiRouteErrorCodes.STALE_REQUEST,
      kind: 'error',
      retryable: false,
      status: 409,
    }
  }
  if (result.outcome === LIFECYCLE_OUTCOME.TIMED_OUT || result.outcome === LIFECYCLE_OUTCOME.AMBIGUOUS_BILLING) {
    if (timeout || result.outcome === LIFECYCLE_OUTCOME.TIMED_OUT) {
      return { code: aiRouteErrorCodes.PROVIDER_TIMEOUT, kind: 'error', retryable: true, status: 504 }
    }
    return { code: aiRouteErrorCodes.PROVIDER_UNAVAILABLE, kind: 'error', retryable: true, status: 502 }
  }
  return { code: aiRouteErrorCodes.PROVIDER_UNAVAILABLE, kind: 'error', retryable: true, status: 502 }
}

export async function executeFoodScanMeteredOperation({
  clientClaim = {},
  executeProvider,
  instanceKey,
  log,
  operationId,
  runtime,
  userId,
} = {}) {
  const identity = createBillingAccountingIdentity(operationId)
  if (!identity || !runtime?.ok) {
    return {
      billing: {
        decision: ENFORCEMENT_DECISION.DENY_INTERNAL,
        outcome: LIFECYCLE_OUTCOME.PERSISTENCE_FAILURE,
      },
    }
  }
  void IMAGE_DEDUP_ROLE.billing_authority

  const billing = await executeDurableMeteredBillingOperation({
    clientClaim,
    commit: (input) => runtime.quota.commitReservation(input),
    evaluate: runtime.evaluate || ((input) => evaluateBillingOperation(input, {
      inspectQuota: (args) => runtime.quota.inspectQuota(args),
    })),
    evaluateInput: {
      featureControl: runtime.featureControl,
      featureId: FOOD_SCAN_CANARY.feature_id,
      providerControls: runtime.providerControls,
      selectedThresholds: runtime.selectedThresholds,
      summariesByKey: runtime.summariesByKey,
      userId,
    },
    executeProvider,
    instanceKey: instanceKey || operationId,
    log,
    operationId,
    operationStore: runtime.operationStore,
    recordUsage: runtime.recordUsage,
    requireDurableDispatch: true,
    reserve: (input) => runtime.quota.reserveQuota(input),
    rollback: (input) => runtime.quota.rollbackReservation(input),
  })
  return { billing }
}
