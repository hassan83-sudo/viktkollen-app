import {
  ADMIN_AUDIT_ACTION,
  PROVIDER_CONTROL_TARGET_TYPE,
  PROVIDER_MODE,
} from './catalog.js'
import { resolveOperationalAvailability } from './operationalAvailability.js'
import { assertProviderControl, resolveProviderAvailability } from './providerAvailability.js'
import { assertCanonicalProviderId, createInMemoryProviderControlStore } from './providerControlStore.js'
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
    mode: row.mode,
    provider_id: row.provider_id,
    reason_code: row.reason_code || '',
    version: row.version,
  })
}

/**
 * Trusted admin mutation for provider controls. No cache.
 * Production authority is billing.set_provider_control in the same transaction as audit.
 */
export function createProviderControlService({
  admin,
  now = () => new Date(),
  store = createInMemoryProviderControlStore(),
} = {}) {
  async function getProviderControl(providerId) {
    const canonical = resolveProviderAvailability({ providerId }).provider_id
    if (!canonical) return null
    return store.get(canonical)
  }

  async function listProviderControls() {
    return store.list()
  }

  async function setProviderControl(input = {}) {
    rejectSecrets(input)
    rejectSecrets(input.clientClaim || {})
    const {
      actorUserId,
      clientClaim = {},
      expectedVersion,
      mode,
      providerId,
      reasonCode,
    } = input
    void clientClaim.updated_by
    void clientClaim.updated_at
    void clientClaim.new_version
    void clientClaim.isAdmin
    void clientClaim.api_key
    const canonical = assertCanonicalProviderId(providerId)
    if (!(await admin.hasBillingAdmin(actorUserId))) fail('forbidden_admin')
    const expected = expectedVersion == null ? 0 : expectedVersion
    if (!Number.isInteger(expected) || expected < 0) fail('invalid_provider_version')
    const validated = assertProviderControl({
      mode,
      provider_id: canonical,
      reason_code: reasonCode,
      version: expected === 0 ? 1 : expected,
    })
    const current = await store.get(canonical)
    const nextVersion = current ? current.version + 1 : 1
    const next = {
      mode: validated.mode,
      provider_id: canonical,
      reason_code: validated.mode === PROVIDER_MODE.AVAILABLE ? (validated.reason_code || null) : validated.reason_code,
      updated_at: now().toISOString(),
      updated_by: actorUserId,
      version: nextVersion,
    }
    const cas = store.compareAndSet({
      expectedVersion: expected,
      providerId: canonical,
      row: next,
    })
    if (cas.conflict) fail('CONFIG_CONFLICT')
    const created = expected === 0
    try {
      const audit = await admin.writeAudit({
        action: created ? ADMIN_AUDIT_ACTION.PROVIDER_CONTROL_CREATED : ADMIN_AUDIT_ACTION.PROVIDER_CONTROL_CHANGED,
        actorUserId,
        after: snapshot(cas.row),
        before: snapshot(current),
        reasonCode: validated.reason_code || 'MANUAL_ADMIN',
        targetId: canonical,
        targetType: PROVIDER_CONTROL_TARGET_TYPE,
      })
      return { audit, control: cas.row }
    } catch (error) {
      if (current) {
        store.compareAndSet({
          expectedVersion: nextVersion,
          providerId: canonical,
          row: current,
        })
      } else {
        store.remove(canonical)
      }
      throw error
    }
  }

  async function resolveFromStore({ clientClaim = {}, featureControl, featureId } = {}) {
    const providerControls = await listProviderControls()
    return resolveOperationalAvailability({
      clientClaim,
      featureControl,
      featureId,
      providerControls,
    })
  }

  return {
    getProviderControl,
    listProviderControls,
    resolveFromStore,
    setProviderControl,
  }
}
