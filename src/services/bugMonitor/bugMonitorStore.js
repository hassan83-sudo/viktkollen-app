import { createSupabaseAdminClient } from '../../../api/_shared/supabaseServer.js'
import { sanitizeBugReport } from './bugMonitor.js'

const ACTOR_KEY = /^(server|[a-f0-9]{16})$/
const GROUP_FIELDS = [
  'affectedCount',
  'appVersion',
  'count',
  'errorType',
  'feature',
  'fingerprint',
  'latestAt',
  'severity',
  'source',
  'status',
]

let storeOverride

function unavailable(code = 'STORE_UNAVAILABLE') {
  const error = new Error(code)
  error.code = code
  throw error
}

export function presentBugSummary(data) {
  const summary = typeof data === 'string' ? JSON.parse(data) : (data || {})
  const groups = Array.isArray(summary.groups) ? summary.groups : []
  return {
    acknowledgedCount: Number(summary.acknowledgedCount) || 0,
    affectedCount: Number(summary.affectedCount) || 0,
    groups: groups.map((group) => {
      const safe = {}
      GROUP_FIELDS.forEach((field) => {
        if (group?.[field] != null) safe[field] = group[field]
      })
      return safe
    }),
    newCount: Number(summary.newCount) || 0,
    recurringCount: Number(summary.recurringCount) || 0,
  }
}

export function createPostgresBugMonitorStore({ client } = {}) {
  if (!client || typeof client.schema !== 'function') unavailable()

  async function rpc(name, args) {
    const { data, error } = await client.schema('bug_monitor').rpc(name, args)
    if (error) unavailable()
    return data
  }

  return {
    durable: true,
    kind: 'supabase',
    async accept(input, context = {}) {
      const actorKey = String(context.actorKey || '')
      if (!ACTOR_KEY.test(actorKey)) return { code: 'INVALID_REPORT', ok: false }
      const sanitized = sanitizeBugReport(input, context)
      const report = sanitized.report
      return rpc('accept_report', {
        p_actor_key: actorKey,
        p_app_version: report.appVersion,
        p_error_type: report.errorType,
        p_feature: report.feature,
        p_fingerprint: report.fingerprint,
        p_occurred_at: report.occurredAt,
        p_release: report.environment.release,
        p_runtime: report.environment.runtime,
        p_severity: report.severity,
        p_source: report.source,
      })
    },
    async acknowledge(fingerprint) {
      const data = await rpc('acknowledge_report', { p_fingerprint: fingerprint })
      return data === true
    },
    async summary() {
      return presentBugSummary(await rpc('summary', {}))
    },
  }
}

export function setBugMonitorStoreForTests(store = undefined) {
  storeOverride = store
}

export function resolveBugMonitorStore() {
  if (storeOverride !== undefined) return storeOverride
  if (import.meta.env?.VITEST) return null
  const client = createSupabaseAdminClient()
  if (!client) return null
  return createPostgresBugMonitorStore({ client })
}
