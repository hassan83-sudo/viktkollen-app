// BILL-AI-TEXT-QUOTA-1: ai.text.request (/api/ai OpenAI actions and
// /api/adaptive-coach) uses the same durable metered lifecycle as AI Ögat
// (aiEyeLiveBilling.js): evaluate -> reserve -> dispatch claim -> OpenAI ->
// commit -> usage, or rollback when OpenAI was provably never started. The
// quota comes from the server plan assignment (plan matrix); client claims
// are ignored.
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

export const AI_TEXT_BILLING = Object.freeze({
  feature_id: 'ai.text.request',
  provider_id: 'openai',
  quantity: 1,
  route: 'api/ai/index.js',
  unit: 'requests',
})

let testRuntimeOverride = null

export function setAiTextBillingRuntimeForTests(runtime = null) {
  testRuntimeOverride = runtime
}

export function installAiTextBillingTestRuntime(overrides = {}) {
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
      usageEventPlan: aiTextUsageEventPlan,
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
  setAiTextBillingRuntimeForTests(runtime)
  return runtime
}

export function aiTextUsageEventPlan({ operationId, userId } = {}) {
  const identity = createBillingAccountingIdentity(operationId)
  return Object.freeze({
    cost_basis: 'UNAVAILABLE',
    event_id: identity?.event_id || operationId,
    event_type: AI_TEXT_BILLING.feature_id,
    feature: AI_TEXT_BILLING.feature_id,
    metadata: Object.freeze({
      usage_basis: 'UNAVAILABLE',
    }),
    provider: AI_TEXT_BILLING.provider_id,
    quantity: AI_TEXT_BILLING.quantity,
    reference_id: identity?.reservation_id || operationId,
    unit: AI_TEXT_BILLING.unit,
    user_id: userId,
  })
}

export async function resolveAiTextBillingRuntime() {
  if (testRuntimeOverride) return testRuntimeOverride
  const client = createSupabaseAdminClient()
  if (!client) return { ok: false, code: 'DURABLE_STORE_UNAVAILABLE' }
  try {
    const usageRepository = createPostgresUsageRepository({ client })
    const quota = createQuotaEngine({
      backend: createPostgresQuotaBackend(createSupabaseBillingRpcQuery(client)),
    })
    const featureControl = await readControlRow(client, 'feature_controls', 'feature_id', AI_TEXT_BILLING.feature_id)
    const providerRow = await readControlRow(client, 'provider_controls', 'provider_id', AI_TEXT_BILLING.provider_id)
    const recordUsage = (input) => recordUsageEvent(input, usageRepository)
    const operationStore = createUsageBackedDispatchStore({
      recordUsage,
      usageEventPlan: aiTextUsageEventPlan,
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

// One operation per request and route/action: the same client attempt id
// replays the same operation (no second quota unit); without one, every
// request is a new operation.
export function createAiTextOperationId({ clientAttemptId, route = AI_TEXT_BILLING.route, userId }) {
  return createScopedOperationId({
    clientAttemptId,
    featureId: AI_TEXT_BILLING.feature_id,
    route,
    userId,
  })
}

export const mapAiTextBillingHttp = mapFoodScanBillingHttp

export async function executeAiTextMeteredOperation({
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
      featureId: AI_TEXT_BILLING.feature_id,
      providerControls: runtime.providerControls,
      quantity: AI_TEXT_BILLING.quantity,
      selectedThresholds: runtime.selectedThresholds,
      summariesByKey: runtime.summariesByKey,
      userId,
    },
    executeProvider,
    instanceKey: instanceKey || operationId,
    log,
    operationId,
    operationStore: runtime.operationStore,
    quantity: AI_TEXT_BILLING.quantity,
    recordUsage: runtime.recordUsage,
    requireDurableDispatch: true,
    reserve: (input) => runtime.quota.reserveQuota(input),
    rollback: (input) => runtime.quota.rollbackReservation(input),
    unit: AI_TEXT_BILLING.unit,
  })
  return { billing }
}
