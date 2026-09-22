import {
  ADMIN_AUDIT_ACTION,
  FEATURE_CONTROL_TARGET_TYPE,
  FEATURE_MODE,
} from './catalog.js'
import { assertFeatureControl, resolveFeatureAvailability } from './featureAvailability.js'
import { assertCanonicalFeatureId, createInMemoryFeatureControlStore } from './featureControlStore.js'
import { sanitizeAdminSnapshot } from './adminAuthority.js'

const SECRET_INPUT_KEYS = Object.freeze(['api_key', 'password', 'secret', 'token'])

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

function snapshot(row) {
  if (!row) return {}
  return sanitizeAdminSnapshot({
    feature_id: row.feature_id,
    mode: row.mode,
    reason_code: row.reason_code || '',
    version: row.version,
  })
}

/**
 * Trusted admin mutation for feature controls. No cache.
 * Production authority is billing.set_feature_control in the same transaction as audit.
 */
export function createFeatureControlService({
  admin,
  now = () => new Date(),
  store = createInMemoryFeatureControlStore(),
} = {}) {
  async function getFeatureControl(featureId) {
    const canonical = resolveFeatureAvailability({ featureId }).feature_id
    if (!canonical) return null
    return store.get(canonical)
  }

  async function setFeatureControl(input = {}) {
    rejectSecrets(input)
    rejectSecrets(input.clientClaim || {})
    const {
      actorUserId,
      clientClaim = {},
      expectedVersion,
      featureId,
      mode,
      reasonCode,
    } = input
    void clientClaim.updated_by
    void clientClaim.updated_at
    void clientClaim.new_version
    void clientClaim.isAdmin
    void clientClaim.api_key
    const canonical = assertCanonicalFeatureId(featureId)
    if (!(await admin.hasBillingAdmin(actorUserId))) fail('forbidden_admin')
    const expected = expectedVersion == null ? 0 : expectedVersion
    if (!Number.isInteger(expected) || expected < 0) fail('invalid_feature_version')
    const validated = assertFeatureControl({
      feature_id: canonical,
      mode,
      reason_code: reasonCode,
      version: expected === 0 ? 1 : expected,
    })
    const current = await store.get(canonical)
    const nextVersion = current ? current.version + 1 : 1
    const next = {
      feature_id: canonical,
      mode: validated.mode,
      reason_code: validated.mode === FEATURE_MODE.ENABLED ? (validated.reason_code || null) : validated.reason_code,
      updated_at: now().toISOString(),
      updated_by: actorUserId,
      version: nextVersion,
    }
    const cas = store.compareAndSet({
      expectedVersion: expected,
      featureId: canonical,
      row: next,
    })
    if (cas.conflict) fail('CONFIG_CONFLICT')
    const created = expected === 0
    try {
      const audit = await admin.writeAudit({
        action: created ? ADMIN_AUDIT_ACTION.FEATURE_CONTROL_CREATED : ADMIN_AUDIT_ACTION.FEATURE_CONTROL_CHANGED,
        actorUserId,
        after: snapshot(cas.row),
        before: snapshot(current),
        reasonCode: validated.reason_code || 'MANUAL_ADMIN',
        targetId: canonical,
        targetType: FEATURE_CONTROL_TARGET_TYPE,
      })
      return { audit, control: cas.row }
    } catch (error) {
      if (current) {
        store.compareAndSet({
          expectedVersion: nextVersion,
          featureId: canonical,
          row: current,
        })
      } else {
        store.remove(canonical)
      }
      throw error
    }
  }

  async function resolveFromStore(featureId, clientClaim = {}) {
    const control = await getFeatureControl(featureId)
    return resolveFeatureAvailability({ clientClaim, control, featureId })
  }

  return {
    getFeatureControl,
    resolveFromStore,
    setFeatureControl,
  }
}
