import { createHash } from 'node:crypto'

const DEFAULT_WINDOW_MS = 10 * 60 * 1000
const DEFAULT_LIMITS = {
  adaptiveCoach: 8,
  analysisConsent: 20,
  bodyAnalysis: 4,
  forgottenItems: 10,
  legacyAi: 20,
  mealAnalysis: 10,
  nutritionPhoto: 12,
  unauthenticated: 24,
}

const processBuckets = new Map()

function hashScope(value = '') {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 24)
}

function defaultAdapter() {
  return {
    consume({ key, limit, now, windowMs }) {
      const bucket = processBuckets.get(key) || { count: 0, resetAt: now + windowMs }

      if (bucket.resetAt <= now) {
        processBuckets.set(key, { count: 1, resetAt: now + windowMs })
        return { limited: false, remaining: Math.max(0, limit - 1), resetAt: now + windowMs }
      }

      if (bucket.count >= limit) {
        return {
          limited: true,
          resetAt: bucket.resetAt,
          retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
        }
      }

      bucket.count += 1
      processBuckets.set(key, bucket)
      return {
        limited: false,
        remaining: Math.max(0, limit - bucket.count),
        resetAt: bucket.resetAt,
      }
    },
    type: 'process-local',
  }
}

let activeAdapter = defaultAdapter()

export function setAiRateLimitAdapterForTests(adapter = null) {
  activeAdapter = adapter || defaultAdapter()
  processBuckets.clear()
}

export function getAiRateLimitMode() {
  return activeAdapter.type || 'process-local'
}

export function checkAiRouteRateLimit({
  limit,
  now = Date.now(),
  route = 'adaptiveCoach',
  userId,
  windowMs = DEFAULT_WINDOW_MS,
} = {}) {
  const routeName = [
    'adaptiveCoach',
    'analysisConsent',
    'bodyAnalysis',
    'forgottenItems',
    'legacyAi',
    'mealAnalysis',
    'nutritionPhoto',
    'unauthenticated',
  ].includes(route) ? route : 'adaptiveCoach'
  const safeLimit = Number(limit || DEFAULT_LIMITS[routeName] || DEFAULT_LIMITS.adaptiveCoach)
  const scope = userId ? `user:${hashScope(userId)}` : 'anonymous'
  const key = `${routeName}:${scope}`

  return {
    ...activeAdapter.consume({
      key,
      limit: safeLimit,
      now,
      route: routeName,
      scope,
      windowMs,
    }),
    mode: getAiRateLimitMode(),
  }
}

export const aiRateLimiterInternals = {
  DEFAULT_LIMITS,
  hashScope,
  processBuckets,
}
