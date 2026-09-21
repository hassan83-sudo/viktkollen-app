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
