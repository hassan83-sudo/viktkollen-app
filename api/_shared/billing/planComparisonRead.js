import { createSupabaseAdminClient } from '../supabaseServer.js'
import { buildPlanComparison } from '../../../src/services/billing/planComparison.js'
import { defaultPlanCatalog } from '../../../src/services/billing/planCatalog.js'

let testReader = null

export function setPlanComparisonReaderForTests(reader = null) {
  testReader = reader
}

export function installCatalogPlanComparisonForTests({
  assignments,
  catalog = defaultPlanCatalog,
  plans,
} = {}) {
  const reader = async (userId) => {
    const assignment = assignments ? await assignments.get(userId) : { plan_id: 'plan.free' }
    return buildPlanComparison({
      currentPlanId: assignment?.plan_id || 'plan.free',
      plans: plans || catalog,
    })
  }
  setPlanComparisonReaderForTests(reader)
  return reader
}

async function maybeSingle(query) {
  const { data, error } = await query.maybeSingle()
  if (error) {
    const wrapped = new Error('plan_comparison_read_failed')
    wrapped.code = 'plan_comparison_read_failed'
    throw wrapped
  }
  return data || null
}

async function listRows(query) {
  const { data, error } = await query
  if (error) {
    const wrapped = new Error('plan_comparison_read_failed')
    wrapped.code = 'plan_comparison_read_failed'
    throw wrapped
  }
  return data || []
}

export async function readPostgresPlanComparison(client, userId) {
  const assignment = await maybeSingle(
    client.schema('billing').from('user_plan_assignments').select('plan_id').eq('user_id', userId),
  )
  const planRows = await listRows(
    client.schema('billing').from('plans').select('plan_id, price_minor, currency, active'),
  )
  const entitlementRows = await listRows(
    client.schema('billing').from('plan_entitlements').select('plan_id, feature, enabled, limit_kind, limit_value, unit'),
  )
  const entitlementsByPlan = new Map()
  for (const row of entitlementRows) {
    const list = entitlementsByPlan.get(row.plan_id) || []
    list.push({
      enabled: row.enabled === true,
      feature: row.feature,
      limit_kind: row.limit_kind,
      limit_value: Number.isInteger(row.limit_value) ? row.limit_value : null,
      unit: row.unit,
    })
    entitlementsByPlan.set(row.plan_id, list)
  }
  return buildPlanComparison({
    currentPlanId: assignment?.plan_id || 'plan.free',
    plans: planRows.map((row) => ({
      active: row.active !== false,
      currency: row.currency,
      enabled_for_sale: false,
      entitlementsFlat: entitlementsByPlan.get(row.plan_id) || [],
      id: row.plan_id,
      price_minor: row.price_minor,
    })),
  })
}

export async function readPlanComparison(userId) {
  if (testReader) return testReader(userId)
  const client = createSupabaseAdminClient()
  if (!client) return null
  try {
    return await readPostgresPlanComparison(client, userId)
  } catch {
    return null
  }
}
