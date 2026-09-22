import { randomUUID } from 'node:crypto'
import {
  ADMIN_AUDIT_ACTION,
  COST_THRESHOLD_TARGET_TYPE,
} from './catalog.js'
import { UUID_RE, sanitizeAdminSnapshot } from './adminAuthority.js'
import { assertCostThreshold } from './costSafety.js'
import {
  createInMemoryCostThresholdStore,
  toResolverThreshold,
} from './costThresholdStore.js'

const SECRET_INPUT_KEYS = Object.freeze(['api_key', 'password', 'prompt', 'secret', 'token'])
const CREATE_KEYS = Object.freeze([
  'actorUserId',
  'amountMinor',
  'clientClaim',
  'currency',
  'enabled',
  'featureId',
  'limitMode',
  'period',
  'reasonCode',
  'scope',
])
const UPDATE_KEYS = Object.freeze([
  'actorUserId',
  'amountMinor',
  'clientClaim',
  'enabled',
  'expectedVersion',
  'reasonCode',
  'thresholdId',
])

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

function rejectSecrets(input = {}) {
  for (const key of Object.keys(input)) {
    if (SECRET_INPUT_KEYS.includes(key)) fail('rejected_secret_field')
  }
}

function rejectUnknownKeys(input, allowed) {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key) && !SECRET_INPUT_KEYS.includes(key)) fail('rejected_unknown_field')
  }
}

function snapshot(row) {
  if (!row) return {}
  return sanitizeAdminSnapshot({
    amount_minor: row.amount_minor,
    currency: row.currency,
    enabled: row.enabled,
    feature_id: row.feature_id || '',
    limit_mode: row.limit_mode,
    period: row.period,
    scope: row.scope,
    threshold_id: row.threshold_id,
    version: row.version,
  })
}

/**
 * Trusted admin mutation for cost thresholds. No cache. No usage aggregation.
 * Production authority is billing.create_cost_threshold / update_cost_threshold
 * in the same transaction as audit.
 */
export function createCostThresholdService({
  admin,
  now = () => new Date(),
  store = createInMemoryCostThresholdStore(),
} = {}) {
  async function createCostThreshold(input = {}) {
    rejectSecrets(input)
    rejectSecrets(input.clientClaim || {})
    rejectUnknownKeys(input, CREATE_KEYS)
    const {
      actorUserId,
      amountMinor,
      clientClaim = {},
      currency = 'SEK',
      enabled = true,
      featureId = null,
      limitMode,
      period,
      reasonCode = 'MANUAL_ADMIN',
      scope,
    } = input
    void clientClaim.updated_by
    void clientClaim.updated_at
    void clientClaim.threshold_id
    void clientClaim.isAdmin
    void clientClaim.role
    void clientClaim.costSafe
    if (typeof enabled !== 'boolean') fail('invalid_cost_enabled')
    if (!(await admin.hasBillingAdmin(actorUserId))) fail('forbidden_admin')
    const validated = assertCostThreshold({
      amount_minor: amountMinor,
      currency,
      feature_id: featureId,
      mode: limitMode,
      period,
      scope,
    })
    const next = {
      amount_minor: validated.amount_minor,
      currency: validated.currency,
      enabled,
      feature_id: validated.feature_id,
      limit_mode: validated.mode,
      period: validated.period,
      scope: validated.scope,
      threshold_id: randomUUID(),
      updated_at: now().toISOString(),
      updated_by: actorUserId,
      version: 1,
    }
    const cas = store.insertIfAbsent(next)
    if (cas.conflict) fail('CONFIG_CONFLICT')
    try {
      const audit = await admin.writeAudit({
        action: ADMIN_AUDIT_ACTION.COST_THRESHOLD_CREATED,
        actorUserId,
        after: snapshot(cas.row),
        before: {},
        reasonCode,
        targetId: cas.row.threshold_id,
        targetType: COST_THRESHOLD_TARGET_TYPE,
      })
      return { audit, threshold: cas.row }
    } catch (error) {
      store.remove(next.threshold_id)
      throw error
    }
  }

  async function updateCostThreshold(input = {}) {
    rejectSecrets(input)
    rejectSecrets(input.clientClaim || {})
    rejectUnknownKeys(input, UPDATE_KEYS)
    const {
      actorUserId,
      amountMinor,
      clientClaim = {},
      enabled,
      expectedVersion,
      reasonCode = 'MANUAL_ADMIN',
      thresholdId,
    } = input
    void clientClaim.updated_by
    void clientClaim.updated_at
    void clientClaim.scope
    void clientClaim.isAdmin
    if (!(await admin.hasBillingAdmin(actorUserId))) fail('forbidden_admin')
    const id = String(thresholdId || '').trim()
    if (!UUID_RE.test(id)) fail('invalid_threshold_id')
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) fail('invalid_cost_version')
    if (typeof enabled !== 'boolean') fail('invalid_cost_enabled')
    const current = store.get(id)
    if (!current) fail('CONFIG_CONFLICT')
    const validated = assertCostThreshold({
      amount_minor: amountMinor,
      currency: current.currency,
      feature_id: current.feature_id,
      mode: current.limit_mode,
      period: current.period,
      scope: current.scope,
    })
    const next = {
      ...current,
      amount_minor: validated.amount_minor,
      enabled,
      updated_at: now().toISOString(),
      updated_by: actorUserId,
      version: current.version + 1,
    }
    const cas = store.compareAndSet({
      expectedVersion,
      row: next,
      thresholdId: id,
    })
    if (cas.conflict) fail('CONFIG_CONFLICT')
    try {
      const audit = await admin.writeAudit({
        action: ADMIN_AUDIT_ACTION.COST_THRESHOLD_CHANGED,
        actorUserId,
        after: snapshot(cas.row),
        before: snapshot(current),
        reasonCode,
        targetId: cas.row.threshold_id,
        targetType: COST_THRESHOLD_TARGET_TYPE,
      })
      return { audit, threshold: cas.row }
    } catch (error) {
      store.compareAndSet({
        expectedVersion: next.version,
        row: current,
        thresholdId: id,
      })
      throw error
    }
  }

  async function listActiveCostThresholds() {
    return store.listActive()
  }

  async function getCostThreshold(thresholdId) {
    return store.get(thresholdId) || null
  }

  return {
    createCostThreshold,
    getCostThreshold,
    listActiveCostThresholds,
    toResolverThreshold,
    updateCostThreshold,
  }
}

export { toResolverThreshold }
