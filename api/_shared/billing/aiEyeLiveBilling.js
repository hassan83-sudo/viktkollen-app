import { ENFORCEMENT_DECISION } from '../../../src/services/billing/catalog.js'
import { createUsageBackedDispatchStore } from '../../../src/services/billing/durableOperationStore.js'
import { evaluateBillingOperation } from '../../../src/services/billing/enforcementOrchestrator.js'
import {
  createBillingAccountingIdentity,
  createScopedOperationId,
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
import { createSupabaseAdminClient } from '../supabaseServer.js'
import { mapFoodScanBillingHttp } from './foodScanLiveBilling.js'

export const AI_EYE_BILLING = Object.freeze({
  feature_id: 'ai.eye.analysis',
  provider_id: 'openai',
  quantity: 1,
  route: 'api/forgotten-items-analysis/index.js',
  unit: 'requests',
})

let testRuntimeOverride = null

export function setAiEyeBillingRuntimeForTests(runtime = null) {
  testRuntimeOverride = runtime
}

export function installAiEyeBillingTestRuntime(overrides = {}) {
  const usageRepository = overrides.usageRepository || createInMemoryUsageRepository()
  const quota = overrides.quota || createQuotaEngine({
    assignments: overrides.assignments,
    usageRepository,
  })
  const recordUsage = (input) => recordUsageEvent(input, usageRepository)
  let operationStore
  try {
    operationStore = createUsageBackedDispatchStore({
      recordUsage,
      usageEventPlan: aiEyeUsageEventPlan,
      usageRepository,
    })
  } catch {
    return { ok: false, code: 'DURABLE_STORE_UNAVAILABLE' }
  }
  const runtime = {
    evaluate: overrides.evaluate,
    featureControl: overrides.featureControl ?? null,
    ok: true,
    operationStore,
    providerControls: overrides.providerControls ?? [],
    quota,
    recordUsage,
    selectedThresholds: overrides.selectedThresholds ?? [],
    summariesByKey: overrides.summariesByKey ?? {},
    usageRepository,
  }
  setAiEyeBillingRuntimeForTests(runtime)
  return runtime
}

export function aiEyeUsageEventPlan({ operationId, userId } = {}) {
  const identity = createBillingAccountingIdentity(operationId)
  return Object.freeze({
    cost_basis: 'UNAVAILABLE',
    event_id: identity?.event_id || operationId,
    event_type: AI_EYE_BILLING.feature_id,
    feature: AI_EYE_BILLING.feature_id,
    metadata: Object.freeze({
      usage_basis: 'UNAVAILABLE',
    }),
    provider: AI_EYE_BILLING.provider_id,
    quantity: AI_EYE_BILLING.quantity,
    reference_id: identity?.reservation_id || operationId,
    unit: AI_EYE_BILLING.unit,
    user_id: userId,
  })
}

export async function resolveAiEyeBillingRuntime() {
  if (testRuntimeOverride) return testRuntimeOverride
  const client = createSupabaseAdminClient()
  if (!client) return { ok: false, code: 'DURABLE_STORE_UNAVAILABLE' }
  try {
    const usageRepository = createPostgresUsageRepository({ client })
    const quota = createQuotaEngine({
      backend: createPostgresQuotaBackend(createSupabaseBillingRpcQuery(client)),
    })
    const featureControl = await readControlRow(client, 'feature_controls', 'feature_id', AI_EYE_BILLING.feature_id)
    const providerRow = await readControlRow(client, 'provider_controls', 'provider_id', AI_EYE_BILLING.provider_id)
    const recordUsage = (input) => recordUsageEvent(input, usageRepository)
    const operationStore = createUsageBackedDispatchStore({
      recordUsage,
      usageEventPlan: aiEyeUsageEventPlan,
      usageRepository,
    })
    return {
      featureControl,
      ok: true,
      operationStore,
      providerControls: providerRow ? [providerRow] : [],
      quota,
      recordUsage,
      selectedThresholds: [],
      summariesByKey: {},
      usageRepository,
    }
  } catch {
    return { ok: false, code: 'DURABLE_STORE_UNAVAILABLE' }
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

export function createAiEyeOperationId({ clientAttemptId, userId }) {
  return createScopedOperationId({
    clientAttemptId,
    featureId: AI_EYE_BILLING.feature_id,
    route: AI_EYE_BILLING.route,
    userId,
  })
}

export const mapAiEyeBillingHttp = mapFoodScanBillingHttp

export async function executeAiEyeMeteredOperation({
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

  const billing = await executeDurableMeteredBillingOperation({
    clientClaim: {},
    commit: (input) => runtime.quota.commitReservation(input),
    evaluate: runtime.evaluate || ((input) => evaluateBillingOperation(input, {
      inspectQuota: (args) => runtime.quota.inspectQuota(args),
    })),
    evaluateInput: {
      featureControl: runtime.featureControl,
      featureId: AI_EYE_BILLING.feature_id,
      providerControls: runtime.providerControls,
      quantity: AI_EYE_BILLING.quantity,
      selectedThresholds: runtime.selectedThresholds,
      summariesByKey: runtime.summariesByKey,
      userId,
    },
    executeProvider,
    instanceKey: instanceKey || operationId,
    log,
    operationId,
    operationStore: runtime.operationStore,
    quantity: AI_EYE_BILLING.quantity,
    recordUsage: runtime.recordUsage,
    requireDurableDispatch: true,
    reserve: (input) => runtime.quota.reserveQuota(input),
    rollback: (input) => runtime.quota.rollbackReservation(input),
    unit: AI_EYE_BILLING.unit,
  })
  return { billing }
}
