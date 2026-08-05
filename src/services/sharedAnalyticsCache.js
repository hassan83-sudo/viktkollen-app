const analyticsCacheLimit = 24
const analyticsCache = new Map()

export function readSharedAnalyticsCache(key) {
  if (!analyticsCache.has(key)) return null
  const value = analyticsCache.get(key)
  analyticsCache.delete(key)
  analyticsCache.set(key, value)
  return value
}

export function writeSharedAnalyticsCache(key, value) {
  analyticsCache.set(key, value)
  while (analyticsCache.size > analyticsCacheLimit) {
    analyticsCache.delete(analyticsCache.keys().next().value)
  }
}

export function clearSharedAnalyticsCache() {
  analyticsCache.clear()
}

export function getSharedAnalyticsCacheStats() {
  return {
    limit: analyticsCacheLimit,
    size: analyticsCache.size,
  }
}
