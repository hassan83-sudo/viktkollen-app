import { describe, expect, it } from 'vitest'
import {
  PLACE_MIN_MEANINGFUL_MOVEMENT_METERS,
  PLACE_STATIONARY_HEARTBEAT_MS,
  decidePlaceLocationPersist,
  isMeaningfulPlaceMovement,
  nextPlaceMapAnchor,
  placeDistanceMeters,
} from './placeLocationPersistence.js'

const LIVE_OBSERVATION_MS = 5000
const NORMAL_INTERVAL_MS = 1800000
const origin = { latitude: 59.3293, longitude: 18.0686, accuracyMeters: 8 }

function northOf(fix, meters) {
  return { ...fix, latitude: fix.latitude + meters / 111320 }
}

describe('place location persistence', () => {
  it('does not treat a few meters of drift as movement', () => {
    const drifted = northOf(origin, 12)
    expect(placeDistanceMeters(origin.latitude, origin.longitude, drifted.latitude, drifted.longitude)).toBeGreaterThan(10)
    expect(placeDistanceMeters(origin.latitude, origin.longitude, drifted.latitude, drifted.longitude)).toBeLessThan(PLACE_MIN_MEANINGFUL_MOVEMENT_METERS)
    expect(isMeaningfulPlaceMovement(origin, drifted)).toBe(false)
    expect(decidePlaceLocationPersist({
      previousFix: origin,
      nextFix: drifted,
      elapsedSincePersistMs: LIVE_OBSERVATION_MS,
      minWriteIntervalMs: LIVE_OBSERVATION_MS,
    })).toMatchObject({ persist: false, reason: 'stationary', recordHistory: false })
  })

  it('treats drift inside the reported GPS accuracy as jitter', () => {
    const uncertain = { ...origin, accuracyMeters: 65 }
    const jitter = { ...northOf(origin, 30), accuracyMeters: 65 }
    expect(isMeaningfulPlaceMovement(uncertain, jitter)).toBe(false)
  })

  it('persists clearly meaningful movement on the next observation', () => {
    const moved = { ...northOf(origin, 80), accuracyMeters: 8 }
    expect(isMeaningfulPlaceMovement(origin, moved)).toBe(true)
    expect(decidePlaceLocationPersist({
      previousFix: origin,
      nextFix: moved,
      elapsedSincePersistMs: LIVE_OBSERVATION_MS,
      minWriteIntervalMs: LIVE_OBSERVATION_MS,
    })).toMatchObject({ persist: true, reason: 'movement', recordHistory: true })
  })

  it('persists a stationary heartbeat without a history point', () => {
    expect(PLACE_STATIONARY_HEARTBEAT_MS).toBe(120000)
    expect(decidePlaceLocationPersist({
      previousFix: origin,
      nextFix: origin,
      elapsedSincePersistMs: PLACE_STATIONARY_HEARTBEAT_MS - LIVE_OBSERVATION_MS,
      minWriteIntervalMs: LIVE_OBSERVATION_MS,
    })).toMatchObject({ persist: false, reason: 'stationary' })
    expect(decidePlaceLocationPersist({
      previousFix: origin,
      nextFix: origin,
      elapsedSincePersistMs: PLACE_STATIONARY_HEARTBEAT_MS,
      minWriteIntervalMs: LIVE_OBSERVATION_MS,
    })).toMatchObject({ persist: true, reason: 'heartbeat', recordHistory: false })
  })

  it('keeps the normal 30-minute interval for a stationary user', () => {
    expect(decidePlaceLocationPersist({
      previousFix: origin,
      nextFix: origin,
      elapsedSincePersistMs: PLACE_STATIONARY_HEARTBEAT_MS,
      minWriteIntervalMs: NORMAL_INTERVAL_MS,
    })).toMatchObject({ persist: false, reason: 'stationary' })
    expect(decidePlaceLocationPersist({
      previousFix: origin,
      nextFix: origin,
      elapsedSincePersistMs: NORMAL_INTERVAL_MS,
      minWriteIntervalMs: NORMAL_INTERVAL_MS,
    })).toMatchObject({ persist: true, reason: 'heartbeat', recordHistory: false })
  })

  it('keeps the map anchor when only the timestamp would have changed', () => {
    const first = nextPlaceMapAnchor(null, 'family-1:person-1', origin)
    const same = nextPlaceMapAnchor(first, 'family-1:person-1', {
      ...origin,
      location_recorded_at: '2026-09-23T12:00:05.000Z',
    })
    expect(same).toBe(first)
    const moved = nextPlaceMapAnchor(first, 'family-1:person-1', northOf(origin, 80))
    expect(moved).not.toBe(first)
    expect(moved.latitude).not.toBe(first.latitude)
  })

  it('estimates one stationary Live hour', () => {
    const hourMs = 60 * 60 * 1000
    let previous = null
    let lastPersistAt = 0
    let observations = 0
    let persisted = 0
    let historyWrites = 0
    for (let elapsed = 0; elapsed < hourMs; elapsed += LIVE_OBSERVATION_MS) {
      observations += 1
      const decision = decidePlaceLocationPersist({
        previousFix: previous,
        nextFix: origin,
        elapsedSincePersistMs: previous ? elapsed - lastPersistAt : Number.POSITIVE_INFINITY,
        minWriteIntervalMs: LIVE_OBSERVATION_MS,
      })
      if (!decision.persist) continue
      persisted += 1
      if (decision.recordHistory) historyWrites += 1
      if (decision.reason !== 'heartbeat') previous = origin
      lastPersistAt = elapsed
    }
    expect(observations).toBe(720)
    expect(persisted).toBe(30)
    expect(historyWrites).toBe(1)
    expect(persisted * 2).toBe(60)
  })
})
