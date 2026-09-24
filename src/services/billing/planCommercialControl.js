import { randomUUID } from 'node:crypto'
import { assertAuditPayloadSafe } from './adminAuthority.js'
import { ADMIN_AUDIT_ACTION } from './catalog.js'
import { defaultPlanCatalog } from './planCatalog.js'

const FREE_PLAN_ID = 'plan.free'
const IGNORED_AUTHORITY_KEYS = new Set(['admin', 'billing_admin', 'isAdmin', 'localStorage', 'role'])
const PRICE_KEYS = new Set(['amount_minor', 'price', 'price_minor', 'price_sek', 'price_sek_minor'])
const QUOTA_KEYS = new Set([
  'ai_eye_requests',
  'ai_text_requests',
  'body_scan_requests',
  'food_scan_requests',
  'gps_live_minutes',
  'limit',
  'quota',
  'quotas',
  'voice_minutes',
])
const ENTITLEMENT_KEYS = new Set(['entitlement', 'entitlements', 'features'])
const SET_KEYS = new Set(['action', 'enabled_for_sale', 'expected_version', 'plan_id'])
const MOVE_KEYS = new Set(['action', 'direction', 'expected_version', 'plan_id'])

function fail(code) {
  return { ok: false, code }
}

function publicQuotas(plan) {
  const source = plan?.commercial_quotas || {}
  const quotas = {
    ai_coach: source.ai_text_requests?.limit,
    ai_eye: source.ai_eye_requests?.limit,
    body_scan: source.body_scan_requests?.limit,
    food_scan: source.food_scan_requests?.limit,
  }
  if (!Object.values(quotas).every((value) => Number.isInteger(value) && value >= 0)) return null
  return quotas
}

export function paidCommercialPlans(catalog = defaultPlanCatalog) {
  return catalog.filter((plan) => plan.id !== FREE_PLAN_ID)
}

export function presentPlanCommercialState(rows, catalog = defaultPlanCatalog) {
  if (!Array.isArray(rows)) return null
  const paid = paidCommercialPlans(catalog)
  if (rows.length !== paid.length) return null
  const byId = new Map(rows.map((row) => [row?.plan_id, row]))
  const presented = []
  for (const plan of paid) {
    const row = byId.get(plan.id)
    if (!row) return null
    const order = Number(row.display_order)
    if (!Number.isInteger(order) || order < 1 || order > paid.length) return null
    const version = Number(row.version)
    if (!Number.isInteger(version) || version < 0) return null
    const quotas = publicQuotas(plan)
    if (!quotas) return null
    presented.push(Object.freeze({
      display_order: order,
      enabled_for_sale: row.enabled_for_sale === true,
      featured: false,
      plan_id: plan.id,
      price_sek_minor: plan.price_minor,
      quota_status: 'PRELIMINARY',
      quotas: Object.freeze(quotas),
      version,
    }))
  }
  if (new Set(presented.map((plan) => plan.display_order)).size !== presented.length) return null
  return Object.freeze(presented.sort((a, b) => a.display_order - b.display_order))
}

export function rejectPlanCommercialOverrides(body, action) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'invalid_plan_control'
  const allowed = action === 'move_plan_display_order' ? MOVE_KEYS : SET_KEYS
  for (const key of Object.keys(body)) {
    if (IGNORED_AUTHORITY_KEYS.has(key) || allowed.has(key)) continue
    if (PRICE_KEYS.has(key)) return 'price_immutable'
    if (QUOTA_KEYS.has(key)) return 'quota_immutable'
    if (ENTITLEMENT_KEYS.has(key)) return 'entitlement_immutable'
    return 'invalid_plan_control'
  }
  return null
}

function knownPaidPlan(planId, catalog) {
  if (planId === FREE_PLAN_ID) return 'protected_plan'
  if (!paidCommercialPlans(catalog).some((plan) => plan.id === planId)) return 'unknown_plan'
  return null
}

export function createInMemoryPlanCommercialStore() {
  const rows = new Map()
  return {
    failReads: false,
    failWrites: false,
    async readAll() {
      if (this.failReads) {
        const error = new Error('PLAN_STATE_UNAVAILABLE')
        error.code = 'PLAN_STATE_UNAVAILABLE'
        throw error
      }
      return new Map(rows)
    },
    async commit(nextRows) {
      if (this.failWrites) {
        const error = new Error('PLAN_WRITE_FAILED')
        error.code = 'PLAN_WRITE_FAILED'
        throw error
      }
      rows.clear()
      for (const [id, row] of nextRows) rows.set(id, Object.freeze({ ...row }))
    },
  }
}

function baseline(catalog, stored) {
  return paidCommercialPlans(catalog).map((plan) => {
    const row = stored.get(plan.id)
    return {
      display_order: row ? row.display_order : plan.display_order,
      enabled_for_sale: row ? row.enabled_for_sale === true : false,
      plan_id: plan.id,
      price_minor: plan.price_minor,
      version: row ? row.version : 0,
    }
  })
}

function auditSnapshot(plan, field) {
  return assertAuditPayloadSafe({
    display_order: plan.display_order,
    enabled_for_sale: plan.enabled_for_sale === true,
    field,
    plan_id: plan.plan_id,
    version: plan.version,
  })
}

export function createPlanCommercialControlService({
  audits,
  catalog = defaultPlanCatalog,
  hasAdmin,
  now = () => new Date().toISOString(),
  store,
} = {}) {
  if (!store || typeof hasAdmin !== 'function' || !audits) {
    throw new Error('plan_commercial_service_incomplete')
  }

  async function authorize(actorUserId) {
    if (!actorUserId) return fail('forbidden_admin')
    try {
      if (await hasAdmin(actorUserId) !== true) return fail('forbidden_admin')
    } catch {
      return fail('PLAN_STATE_UNAVAILABLE')
    }
    return null
  }

  async function readStored() {
    try {
      return await store.readAll()
    } catch {
      return null
    }
  }

  async function list(actorUserId) {
    const denied = await authorize(actorUserId)
    if (denied) return denied
    const stored = await readStored()
    if (!stored) return fail('PLAN_STATE_UNAVAILABLE')
    const plans = presentPlanCommercialState(baseline(catalog, stored), catalog)
    if (!plans) return fail('PLAN_STATE_UNAVAILABLE')
    return { ok: true, plans }
  }

  async function writeChange({ actorUserId, before, field, nextStored }) {
    const stored = await readStored()
    if (!stored) return fail('PLAN_STATE_UNAVAILABLE')
    const plans = presentPlanCommercialState(baseline(catalog, nextStored), catalog)
    if (!plans) return fail('PLAN_WRITE_FAILED')
    const after = plans.find((plan) => plan.plan_id === before.plan_id)
    try {
      await store.commit(nextStored)
    } catch {
      return fail('PLAN_WRITE_FAILED')
    }
    try {
      await audits.insert({
        action: ADMIN_AUDIT_ACTION.PLAN_COMMERCIAL_CHANGED,
        admin_user_id: actorUserId,
        after_safe: auditSnapshot(after, field),
        audit_id: randomUUID(),
        before_safe: auditSnapshot(before, field),
        created_at: now(),
        reason_code: 'MANUAL_ADMIN',
        target_id: before.plan_id,
        target_type: 'plan_commercial',
      })
    } catch (error) {
      try {
        await store.commit(stored)
      } catch {
        return fail('PLAN_WRITE_FAILED')
      }
      return fail(error?.code || 'PLAN_WRITE_FAILED')
    }
    return { ok: true, plans }
  }

  async function setAvailability(actorUserId, command = {}) {
    const denied = await authorize(actorUserId)
    if (denied) return denied
    const override = rejectPlanCommercialOverrides(command, 'set_plan_availability')
    if (override) return fail(override)
    const planError = knownPaidPlan(command.plan_id, catalog)
    if (planError) return fail(planError)
    if (typeof command.enabled_for_sale !== 'boolean') return fail('invalid_plan_control')
    if (!Number.isInteger(command.expected_version) || command.expected_version < 0) {
      return fail('invalid_plan_control')
    }
    const stored = await readStored()
    if (!stored) return fail('PLAN_STATE_UNAVAILABLE')
    const current = baseline(catalog, stored).find((plan) => plan.plan_id === command.plan_id)
    if (current.version !== command.expected_version) return fail('CONFIG_CONFLICT')
    const nextStored = new Map(stored)
    nextStored.set(command.plan_id, {
      display_order: current.display_order,
      enabled_for_sale: command.enabled_for_sale,
      plan_id: command.plan_id,
      updated_at: now(),
      updated_by: actorUserId,
      version: current.version + 1,
    })
    return writeChange({
      actorUserId,
      before: current,
      field: 'enabled_for_sale',
      nextStored,
    })
  }

  async function move(actorUserId, command = {}) {
    const denied = await authorize(actorUserId)
    if (denied) return denied
    const override = rejectPlanCommercialOverrides(command, 'move_plan_display_order')
    if (override) return fail(override)
    const planError = knownPaidPlan(command.plan_id, catalog)
    if (planError) return fail(planError)
    if (command.direction !== 'up' && command.direction !== 'down') return fail('invalid_plan_control')
    if (!Number.isInteger(command.expected_version) || command.expected_version < 0) {
      return fail('invalid_plan_control')
    }
    const stored = await readStored()
    if (!stored) return fail('PLAN_STATE_UNAVAILABLE')
    const ordered = baseline(catalog, stored).sort((a, b) => a.display_order - b.display_order)
    const index = ordered.findIndex((plan) => plan.plan_id === command.plan_id)
    const current = ordered[index]
    if (current.version !== command.expected_version) return fail('CONFIG_CONFLICT')
    const neighbor = ordered[index + (command.direction === 'up' ? -1 : 1)]
    if (!neighbor) return fail('order_bound')
    const nextStored = new Map(stored)
    const stamp = now()
    nextStored.set(current.plan_id, {
      display_order: neighbor.display_order,
      enabled_for_sale: current.enabled_for_sale,
      plan_id: current.plan_id,
      updated_at: stamp,
      updated_by: actorUserId,
      version: current.version + 1,
    })
    nextStored.set(neighbor.plan_id, {
      display_order: current.display_order,
      enabled_for_sale: neighbor.enabled_for_sale,
      plan_id: neighbor.plan_id,
      updated_at: stamp,
      updated_by: actorUserId,
      version: neighbor.version + 1,
    })
    return writeChange({
      actorUserId,
      before: current,
      field: 'display_order',
      nextStored,
    })
  }

  return {
    durable: false,
    hasAdmin,
    list,
    move,
    setAvailability,
  }
}

export function createPlanCommercialControlAdapter(service) {
  return {
    durable: service.durable === true,
    async hasBillingAdmin(userId) {
      return (await service.hasAdmin(userId)) === true
    },
    listPlanCommercial(actorUserId) {
      return service.list(actorUserId)
    },
    movePlanDisplayOrder(actorUserId, command) {
      return service.move(actorUserId, command)
    },
    setPlanAvailability(actorUserId, command) {
      return service.setAvailability(actorUserId, command)
    },
  }
}
