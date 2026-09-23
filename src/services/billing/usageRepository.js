export function createInMemoryUsageRepository() {
  const byEventId = new Map()

  return {
    async getByEventId(eventId) {
      return byEventId.get(eventId) || null
    },
    async insert(event) {
      if (byEventId.has(event.event_id)) {
        return { duplicate: true, event: byEventId.get(event.event_id) }
      }
      const stored = Object.freeze({ ...event, metadata: { ...event.metadata } })
      byEventId.set(event.event_id, stored)
      return { duplicate: false, event: stored }
    },
    async list() {
      return [...byEventId.values()]
    },
    /**
     * Bounded by [period_start, period_end). Optional event_types filter.
     * Events are already sanitized — no prompt/audio/image/GPS fields.
     */
    async listInPeriod({ eventTypes, period_end, period_start } = {}) {
      if (!period_start || !period_end) {
        const error = new Error('unbounded_usage_query')
        error.code = 'unbounded_usage_query'
        throw error
      }
      if (!Array.isArray(eventTypes)) {
        const error = new Error('unbounded_usage_query')
        error.code = 'unbounded_usage_query'
        throw error
      }
      const start = new Date(period_start).getTime()
      const end = new Date(period_end).getTime()
      const allowed = new Set(eventTypes)
      return [...byEventId.values()].filter((event) => {
        const t = new Date(event.occurred_at).getTime()
        if (!(t >= start && t < end)) return false
        if (!allowed.has(event.event_type)) return false
        return true
      })
    },
    reset() {
      byEventId.clear()
    },
  }
}

const defaultRepository = createInMemoryUsageRepository()
let activeRepository = defaultRepository

export function getUsageRepository() {
  return activeRepository
}

export function setUsageRepositoryForTests(repository = defaultRepository) {
  activeRepository = repository || defaultRepository
  return activeRepository
}
