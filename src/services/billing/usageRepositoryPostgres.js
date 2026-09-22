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
 * BILL-1 usage_events via service_role. Unique event_id is dispatch CAS.
 * No schema change. Process Maps are not used.
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
