import { collectCostThresholdSummaries } from '../../../src/services/billing/costThresholdSelection.js'
import { defaultCostCatalog } from '../../../src/services/billing/costCatalog.js'

// Preliminary internal estimate, not a customer price or measured provider cost.
const AI_NATURE_ESTIMATED_SEK_ORE_PER_REQUEST = 2
const aiNatureCostCatalog = Object.freeze([
  ...defaultCostCatalog,
  Object.freeze({
    currency: 'SEK',
    effective_from: null,
    effective_to: null,
    model: '', // Nature usage events currently do not record a model.
    per_quantity: 1,
    price_minor: AI_NATURE_ESTIMATED_SEK_ORE_PER_REQUEST,
    provider: 'openai',
    service: 'ai.nature.identification',
    status: 'CONFIGURED',
    unit: 'requests',
  }),
])
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

export const AI_NATURE_BILLING = Object.freeze({
  feature_id: 'ai.nature.identification',
  provider_id: 'openai',
  quantity: 1,
  route: 'api/ai-nature-identification/index.js',
  unit: 'requests',
})

// Both routes reserve against food.scan atomically in PostgreSQL.
// Nature keeps its own feature identity, operational gate and usage event.
export function sharedFoodScanQuota(quota) {
  return {
    ...quota,
    inspectQuota: (input) => quota.inspectQuota({ ...input, feature: 'food.scan' }),
    reserveQuota: (input) => quota.reserveQuota({ ...input, feature: 'food.scan' }),
  }
}

let testRuntimeOverride = null

export function setAiNatureBillingRuntimeForTests(runtime = null) {
  testRuntimeOverride = runtime
}

export function installAiNatureBillingTestRuntime(overrides = {}) {
  const usageRepository = overrides.usageRepository || createInMemoryUsageRepository()
  const quota = sharedFoodScanQuota(overrides.quota || createQuotaEngine({
    assignments: overrides.assignments,
    usageRepository,
  }))
  const recordUsage = (input) => recordUsageEvent(input, usageRepository)
  let operationStore
  try {
    operationStore = createUsageBackedDispatchStore({
      recordUsage,
      usageEventPlan: aiNatureUsageEventPlan,
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
  setAiNatureBillingRuntimeForTests(runtime)
  return runtime
}

export function aiNatureUsageEventPlan({ operationId, userId } = {}) {
  const identity = createBillingAccountingIdentity(operationId)
  return Object.freeze({
    cost_basis: 'UNAVAILABLE',
    event_id: identity?.event_id || operationId,
    event_type: AI_NATURE_BILLING.feature_id,
    feature: AI_NATURE_BILLING.feature_id,
    metadata: Object.freeze({
      usage_basis: 'UNAVAILABLE',
    }),
    provider: AI_NATURE_BILLING.provider_id,
    quantity: AI_NATURE_BILLING.quantity,
    reference_id: identity?.reservation_id || operationId,
    unit: AI_NATURE_BILLING.unit,
    user_id: userId,
  })
}

export async function resolveAiNatureBillingRuntime() {
  if (testRuntimeOverride) return testRuntimeOverride
  const client = createSupabaseAdminClient()
  if (!client) return { ok: false, code: 'DURABLE_STORE_UNAVAILABLE' }
  try {
    const usageRepository = createPostgresUsageRepository({ client })
    const quota = sharedFoodScanQuota(createQuotaEngine({
      backend: createPostgresQuotaBackend(createSupabaseBillingRpcQuery(client)),
    }))
    const featureControl = await readControlRow(client, 'feature_controls', 'feature_id', AI_NATURE_BILLING.feature_id)
    const providerRow = await readControlRow(client, 'provider_controls', 'provider_id', AI_NATURE_BILLING.provider_id)
    const { data: thresholds, error: thresholdsError } = await client.schema('billing')
      .from('cost_thresholds').select('*').eq('enabled', true)
    if (thresholdsError) throw thresholdsError
    const costGuard = await collectCostThresholdSummaries({
      catalog: aiNatureCostCatalog,
      featureId: AI_NATURE_BILLING.feature_id,
      repository: usageRepository,
      // AI Nature uses its own hard limits; unrelated services retain global limits.
      thresholds: (thresholds || []).filter((row) => row.scope === 'FEATURE' && row.feature_id === AI_NATURE_BILLING.feature_id),
    })
    const recordUsage = (input) => recordUsageEvent(input, usageRepository)
    const operationStore = createUsageBackedDispatchStore({
      recordUsage,
      usageEventPlan: aiNatureUsageEventPlan,
      usageRepository,
    })
    return {
      featureControl,
      ok: true,
      operationStore,
      providerControls: providerRow ? [providerRow] : [],
      quota,
      recordUsage,
      selectedThresholds: costGuard.selectedThresholds,
      summariesByKey: costGuard.summariesByKey,
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

export function createAiNatureOperationId({ clientAttemptId, userId }) {
  return createScopedOperationId({
    clientAttemptId,
    featureId: AI_NATURE_BILLING.feature_id,
    route: AI_NATURE_BILLING.route,
    userId,
  })
}

export const mapAiNatureBillingHttp = mapFoodScanBillingHttp

export async function executeAiNatureMeteredOperation({
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

  // Production must never dispatch a paid AI request without an active cost guard.
  // Injected test evaluators are isolated and do not call the real provider.
  if (!runtime.evaluate && (!Array.isArray(runtime.selectedThresholds) || runtime.selectedThresholds.length === 0)) {
    return {
      billing: {
        decision: ENFORCEMENT_DECISION.DENY_COST_UNAVAILABLE,
        outcome: LIFECYCLE_OUTCOME.DENIED_EVALUATE,
      },
    }
  }

  const billing = await executeDurableMeteredBillingOperation({
    usageEventPlan: aiNatureUsageEventPlan,
    clientClaim: {},
    commit: (input) => runtime.quota.commitReservation(input),
    evaluate: runtime.evaluate || ((input) => evaluateBillingOperation(input, {
      inspectQuota: (args) => runtime.quota.inspectQuota(args),
    })),
    evaluateInput: {
      featureControl: runtime.featureControl,
      featureId: AI_NATURE_BILLING.feature_id,
      providerControls: runtime.providerControls,
      quantity: AI_NATURE_BILLING.quantity,
      selectedThresholds: runtime.selectedThresholds,
      summariesByKey: runtime.summariesByKey,
      userId,
    },
    executeProvider,
    instanceKey: instanceKey || operationId,
    log,
    operationId,
    operationStore: runtime.operationStore,
    quantity: AI_NATURE_BILLING.quantity,
    recordUsage: runtime.recordUsage,
    requireDurableDispatch: true,
    reserve: (input) => runtime.quota.reserveQuota(input),
    rollback: (input) => runtime.quota.rollbackReservation(input),
    unit: AI_NATURE_BILLING.unit,
  })
  return { billing }
}
