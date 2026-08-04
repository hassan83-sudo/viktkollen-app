import { describe, expect, it } from 'vitest'

import {
  canSafelyMergeSyncPayload,
  resolveCloudSyncConflict,
} from './cloudConflictResolver.js'
import { calculateChecksum, stableSerialize } from './syncMetadata.js'

const baseTime = '2026-08-04T10:00:00.000Z'

function record(storageKey, payload, overrides = {}) {
  return {
    checksum: calculateChecksum(stableSerialize(payload)),
    clientUpdatedAt: baseTime,
    dataVersion: 1,
    deviceId: 'device-a',
    payload,
    storageKey,
    ...overrides,
  }
}

describe('cloudConflictResolver V3', () => {
  it('returns identical when checksums match', () => {
    const local = record('viktkollen.weights', [{ id: 'w1', value: 90 }])
    const remote = record('viktkollen.weights', local.payload, { deviceId: 'device-b' })

    expect(resolveCloudSyncConflict({ localRecord: local, remoteRecord: remote }).decision).toBe('identical')
  })

  it('lets local win when only local changed', () => {
    const previous = { checksum: 'old' }
    const local = record('viktkollen.weights', [{ id: 'w1', updatedAt: baseTime, value: 90 }])
    const remote = record('viktkollen.weights', [], { checksum: 'old', deviceId: 'device-b' })

    expect(resolveCloudSyncConflict({ localRecord: local, previousMetadata: previous, remoteRecord: remote }).decision).toBe('localWins')
  })

  it('lets remote win when only remote changed', () => {
    const previous = { checksum: 'old' }
    const local = record('viktkollen.weights', [], { checksum: 'old' })
    const remote = record('viktkollen.weights', [{ id: 'w1', updatedAt: baseTime, value: 90 }], { deviceId: 'device-b' })

    expect(resolveCloudSyncConflict({ localRecord: local, previousMetadata: previous, remoteRecord: remote }).decision).toBe('remoteWins')
  })

  it('safe-merges different objects with stable ids', () => {
    const previous = { checksum: 'old' }
    const local = record('viktkollen.meals', [{ id: 'm1', name: 'Frukost', updatedAt: '2026-08-04T08:00:00.000Z' }])
    const remote = record('viktkollen.meals', [{ id: 'm2', name: 'Lunch', updatedAt: '2026-08-04T12:00:00.000Z' }], { deviceId: 'device-b' })
    const decision = resolveCloudSyncConflict({ localRecord: local, previousMetadata: previous, remoteRecord: remote })

    expect(decision.decision).toBe('safeMerge')
    expect(decision.mergePayload.map((item) => item.id)).toEqual(['m1', 'm2'])
  })

  it('creates manual conflict when same object changed on both sides inside clock skew', () => {
    const previous = { checksum: 'old' }
    const local = record('viktkollen.meals', [{ id: 'm1', name: 'Frukost', updatedAt: '2026-08-04T10:00:00.000Z' }])
    const remote = record('viktkollen.meals', [{ id: 'm1', name: 'Lunch', updatedAt: '2026-08-04T10:01:00.000Z' }], { deviceId: 'device-b' })
    const decision = resolveCloudSyncConflict({ localRecord: local, previousMetadata: previous, remoteRecord: remote })

    expect(decision.decision).toBe('manualConflict')
    expect(decision.conflictReason).toContain('Samma objekt')
  })

  it('creates manual conflict for deleted versus active collision', () => {
    const previous = { checksum: 'old' }
    const local = record('viktkollen.meals', [{ deletedAt: '2026-08-04T10:00:00.000Z', id: 'm1', updatedAt: '2026-08-04T10:00:00.000Z' }])
    const remote = record('viktkollen.meals', [{ id: 'm1', name: 'Lunch', updatedAt: '2026-08-04T11:00:00.000Z' }], { deviceId: 'device-b' })
    const decision = resolveCloudSyncConflict({ localRecord: local, previousMetadata: previous, remoteRecord: remote })

    expect(decision.decision).toBe('manualConflict')
  })

  it('blocks unsafe schema version', () => {
    const local = record('viktkollen.weights', [], { dataVersion: 99 })
    const remote = record('viktkollen.weights', [], { deviceId: 'device-b' })

    expect(resolveCloudSyncConflict({ localRecord: local, remoteRecord: remote }).decision).toBe('manualConflict')
  })

  it('blocks payload with prototype pollution fields', () => {
    const local = record('viktkollen.weights', { constructor: { polluted: true } })

    expect(resolveCloudSyncConflict({ localRecord: local }).decision).toBe('invalidPayload')
  })

  it('does not last-write-win profile conflicts automatically', () => {
    const previous = { checksum: 'old' }
    const local = record('viktkollen.profile', { goalWeight: 78, updatedAt: '2026-08-04T10:00:00.000Z' })
    const remote = record('viktkollen.profile', { goalWeight: 80, updatedAt: '2026-08-04T11:00:00.000Z' }, { deviceId: 'device-b' })

    expect(resolveCloudSyncConflict({ localRecord: local, previousMetadata: previous, remoteRecord: remote }).decision).toBe('manualConflict')
  })

  it('merges weekly meal planner weeks deterministically', () => {
    const merged = canSafelyMergeSyncPayload(
      'viktkollen.mealPlans',
      { weeks: { '2026-08-03': { days: { '2026-08-03': [{ id: 'a', updatedAt: baseTime }] }, items: [] } } },
      { weeks: { '2026-08-03': { days: { '2026-08-04': [{ id: 'b', updatedAt: baseTime }] }, items: [] } } },
    )

    expect(merged.ok).toBe(true)
    expect(merged.payload.weeks['2026-08-03'].days['2026-08-04'][0].id).toBe('b')
  })

  it('is deterministic for the same input', () => {
    const local = record('viktkollen.weights', [{ id: 'w1', updatedAt: baseTime, value: 90 }])
    const remote = record('viktkollen.weights', [{ id: 'w2', updatedAt: baseTime, value: 91 }], { deviceId: 'device-b' })

    expect(resolveCloudSyncConflict({ localRecord: local, previousMetadata: { checksum: 'old' }, remoteRecord: remote }))
      .toEqual(resolveCloudSyncConflict({ localRecord: local, previousMetadata: { checksum: 'old' }, remoteRecord: remote }))
  })
})
