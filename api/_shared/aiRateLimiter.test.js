import { afterEach, describe, expect, it } from 'vitest'
import {
  aiRateLimiterInternals,
  checkAiRouteRateLimit,
  getAiRateLimitMode,
  setAiRateLimitAdapterForTests,
} from './aiRateLimiter.js'

describe('aiRateLimiter', () => {
  afterEach(() => {
    setAiRateLimitAdapterForTests()
  })

  it('limits per verified user and route', () => {
    const firstCoach = checkAiRouteRateLimit({ limit: 1, now: 1000, route: 'adaptiveCoach', userId: 'user-a' })
    const secondCoach = checkAiRouteRateLimit({ limit: 1, now: 1001, route: 'adaptiveCoach', userId: 'user-a' })
    const photo = checkAiRouteRateLimit({ limit: 1, now: 1002, route: 'nutritionPhoto', userId: 'user-a' })
    const otherUser = checkAiRouteRateLimit({ limit: 1, now: 1003, route: 'adaptiveCoach', userId: 'user-b' })

    expect(firstCoach.limited).toBe(false)
    expect(secondCoach.limited).toBe(true)
    expect(photo.limited).toBe(false)
    expect(otherUser.limited).toBe(false)
    expect(getAiRateLimitMode()).toBe('process-local')
  })

  it('does not expose raw user identifiers in bucket keys', () => {
    checkAiRouteRateLimit({ route: 'adaptiveCoach', userId: 'sensitive-user-id' })
    const keys = [...aiRateLimiterInternals.processBuckets.keys()].join(' ')

    expect(keys).not.toContain('sensitive-user-id')
    expect(keys).toMatch(/adaptiveCoach:user:/)
  })

  it('supports all production AI route buckets', () => {
    const routes = ['adaptiveCoach', 'bodyAnalysis', 'legacyAi', 'mealAnalysis', 'nutritionPhoto']

    routes.forEach((route) => {
      const result = checkAiRouteRateLimit({ route, userId: 'user-a' })
      expect(result.limited).toBe(false)
    })
  })
})
