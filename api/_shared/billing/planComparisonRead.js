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

const PLAN_READ_OPERATIONS = new Set([
  'user_plan_assignments',
  'plans',
  'plan_entitlements',
  'build_plan_comparison',
])

function sanitizeDiagnosticText(value) {
  const text = String(value ?? '')
    .replace(/bearer\s+\S+/gi, '[redacted]')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?/g, '[redacted]')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '[redacted]')
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, '[redacted]')
    .slice(0, 180)
  if (/authorization|cookie|service[_-]?role|anon[_-]?key|password|secret|database_url|connection/i.test(text)) return ''
  return text
}

function safeCode(value) {
  const code = String(value ?? '')
  return /^[A-Za-z0-9_]{1,40}$/.test(code) ? code : ''
}

function failRead(operation, error) {
  const wrapped = new Error('plan_comparison_read_failed')
  wrapped.code = 'plan_comparison_read_failed'
  wrapped.operation = operation
  wrapped.postgrestCode = error?.code
  wrapped.status = error?.status
  wrapped.safeMessage = error?.message
  wrapped.details = error?.details
  wrapped.hint = error?.hint
  return wrapped
}

function logPlanReadFailure(error) {
  const operation = PLAN_READ_OPERATIONS.has(error?.operation) ? error.operation : 'plan_comparison'
  const entry = {
    code: safeCode(error?.postgrestCode),
    event: 'billing_plan_read_failed',
    operation,
  }
  if (Number.isInteger(error?.status)) entry.status = error.status
  const message = sanitizeDiagnosticText(error?.safeMessage)
  const details = sanitizeDiagnosticText(error?.details)
  const hint = sanitizeDiagnosticText(error?.hint)
  if (message) entry.message = message
  if (details) entry.details = details
  if (hint) entry.hint = hint
  console.warn('[api/billing/plans] plan read failed', entry)
}

async function maybeSingle(query, operation) {
  const { data, error } = await query.maybeSingle()
  if (error) throw failRead(operation, error)
  return data || null
}

async function listRows(query, operation) {
  const { data, error } = await query
  if (error) throw failRead(operation, error)
  return data || []
}

export async function readPostgresPlanComparison(client, userId) {
  try {
    const assignment = await maybeSingle(
      client.schema('billing').from('user_plan_assignments').select('plan_id').eq('user_id', userId),
      'user_plan_assignments',
    )
    const planRows = await listRows(
      client.schema('billing').from('plans').select('plan_id, price_minor, currency, active'),
      'plans',
    )
    const entitlementRows = await listRows(
      client.schema('billing').from('plan_entitlements').select('plan_id, feature, enabled, limit_kind, limit_value, unit'),
      'plan_entitlements',
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
    try {
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
    } catch (error) {
      throw failRead('build_plan_comparison', error)
    }
  } catch (error) {
    logPlanReadFailure(error)
    throw error
  }
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
