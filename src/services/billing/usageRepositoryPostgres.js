import { toPersistedUsageRow } from './usageEvent.js'

function unavailable(code = 'usage_repository_unavailable') {
  const error = new Error(code)
  error.code = code
  throw error
}

function isUniqueViolation(error) {
  const code = String(error?.code || '')
  const message = String(error?.message || '')
  return code === '23505' || /duplicate key|unique constraint/i.test(message)
}

/**
 * BILL-1 usage_events via service_role. Unique event_id is the insert identity.
 * Schema changes belong in migrations. Process Maps are not used.
 */
export function createPostgresUsageRepository({ client } = {}) {
  if (!client || typeof client.schema !== 'function') unavailable()

  function table() {
    return client.schema('billing').from('usage_events')
  }

  return {
    authority: 'usage_events',
    durable: true,
    async getByEventId(eventId) {
      const id = String(eventId || '').trim()
      if (!id) return null
      const { data, error } = await table().select('*').eq('event_id', id).maybeSingle()
      if (error) throw error
      return data || null
    },
    async listForTelemetry({ limit = 2000 } = {}) {
      const bounded = Math.min(Math.max(Number(limit) || 1, 1), 2000)
      const { data, error } = await table()
        .select('event_id,reference_id,event_type,feature,provider,model,unit,quantity,occurred_at,cost_basis,metadata')
        .order('occurred_at', { ascending: false })
        .limit(bounded)
      if (error) throw error
      return data || []
    },
    async listInPeriod({ eventTypes, period_end, period_start } = {}) {
      const start = new Date(period_start)
      const end = new Date(period_end)
      if (!Array.isArray(eventTypes) || eventTypes.length === 0 ||
          !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) ||
          start >= end) unavailable('unbounded_usage_query')
      const { data, error } = await table()
        .select('event_id,event_type,feature,provider,model,unit,quantity,occurred_at,cost_basis,metadata')
        .in('event_type', eventTypes)
        .gte('occurred_at', start.toISOString())
        .lt('occurred_at', end.toISOString())
        .order('occurred_at', { ascending: true })
        .limit(10001)
      if (error) throw error
      if ((data || []).length > 10000) unavailable('usage_query_limit_exceeded')
      return data || []
    },
    async insert(event) {
      const row = toPersistedUsageRow(event)
      const { data, error } = await table().insert(row).select('*').maybeSingle()
      if (isUniqueViolation(error)) {
        const existing = await this.getByEventId(row.event_id)
        return { duplicate: true, event: existing || row }
      }
      if (error) throw error
      return { duplicate: false, event: data || row }
    },
  }
}
