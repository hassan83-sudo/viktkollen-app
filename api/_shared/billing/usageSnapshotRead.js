import { createSupabaseAdminClient } from '../supabaseServer.js'
import { getPlanById } from '../../../src/services/billing/planCatalog.js'
import { periodBounds } from '../../../src/services/billing/period.js'
import {
  buildUsageSnapshot,
  entitlementsFromPlan,
  snapshotForPlan,
} from '../../../src/services/billing/usageSnapshot.js'

let testReader = null

export function setUsageSnapshotReaderForTests(reader = null) {
  testReader = reader
}

export function installCatalogUsageSnapshotForTests({
  assignments,
  catalog,
  quota,
} = {}) {
  const reader = async (userId) => {
    const assignment = assignments ? await assignments.get(userId) : { plan_id: 'plan.free' }
    const plan = getPlanById(assignment?.plan_id || 'plan.free', catalog)
    if (!plan || !quota) return snapshotForPlan({ plan })
    const period = periodBounds(plan.billing_interval || 'month')
    const entitlements = entitlementsFromPlan(plan)
    const reservations = []
    for (const entitlement of entitlements) {
      if (entitlement.limit_kind !== 'NUMBER') continue
      const inspected = await quota.inspectQuota({
        clientClaim: {},
        feature: entitlement.feature,
        unit: entitlement.unit,
        userId,
      })
      const limit = Number(inspected?.limit)
      const remaining = Number(inspected?.remaining)
      if (!Number.isInteger(limit) || !Number.isInteger(remaining)) continue
      const used = Math.max(0, limit - Math.max(0, remaining))
      if (used > 0) {
        reservations.push({
          actual_quantity: used,
          feature: entitlement.feature,
          period_start: period.period_start,
          quantity: used,
          status: 'COMMITTED',
          unit: entitlement.unit,
        })
      }
    }
    return buildUsageSnapshot({
      entitlements,
      period,
      plan,
      reservations,
    })
  }
  setUsageSnapshotReaderForTests(reader)
  return reader
}

async function maybeSingle(query) {
  const { data, error } = await query.maybeSingle()
  if (error) {
    const wrapped = new Error('usage_snapshot_read_failed')
    wrapped.code = 'usage_snapshot_read_failed'
    throw wrapped
  }
  return data || null
}

async function listRows(query) {
  const { data, error } = await query
  if (error) {
    const wrapped = new Error('usage_snapshot_read_failed')
    wrapped.code = 'usage_snapshot_read_failed'
    throw wrapped
  }
  return data || []
}

export async function readPostgresUsageSnapshot(client, userId) {
  const assignment = await maybeSingle(
    client.schema('billing').from('user_plan_assignments').select('plan_id').eq('user_id', userId),
  )
  const planId = assignment?.plan_id || 'plan.free'
  const plan = await maybeSingle(
    client.schema('billing').from('plans').select('plan_id, price_minor, billing_interval, active').eq('plan_id', planId),
  )
  if (!plan || plan.active === false) return null
  const entitlements = await listRows(
    client.schema('billing').from('plan_entitlements').select('feature, enabled, limit_kind, limit_value, unit').eq('plan_id', planId),
  )
  const period = periodBounds(plan.billing_interval || 'month')
  const reservations = await listRows(
    client.schema('billing').from('quota_reservations').select('feature, unit, status, quantity, actual_quantity, expires_at, period_start').eq('user_id', userId),
  )
  return buildUsageSnapshot({
    entitlements,
    period,
    plan: { price_minor: plan.price_minor },
    reservations,
  })
}

export async function readUsageSnapshot(userId) {
  if (testReader) return testReader(userId)
  const client = createSupabaseAdminClient()
  if (!client) return null
  try {
    return await readPostgresUsageSnapshot(client, userId)
  } catch {
    return null
  }
}
