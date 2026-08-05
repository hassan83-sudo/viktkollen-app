import { describe, expect, it, vi } from 'vitest'
import { buildRuntimePerformanceSummary, buildStoragePressureSummary } from './performanceDiagnostics.js'

function storage(values) {
  return {
    getItem: vi.fn((key) => values[key] || ''),
  }
}

describe('performanceDiagnostics', () => {
  it('summarizes storage pressure as bands without exposing values', () => {
    const summary = buildStoragePressureSummary({
      keys: ['viktkollen.meals', 'viktkollen.weights'],
      storage: storage({
        'viktkollen.meals': 'x'.repeat(25_000),
        'viktkollen.weights': 'secret raw value',
      }),
    })

    expect(summary.entries).toEqual([
      { band: 'medel', key: 'viktkollen.meals' },
      { band: 'liten', key: 'viktkollen.weights' },
    ])
    expect(JSON.stringify(summary)).not.toContain('secret raw value')
  })

  it('builds read-only runtime diagnostics without user identity', () => {
    const summary = buildRuntimePerformanceSummary({
      lazyChunkCount: 4,
      largestLazyChunks: ['MealLogger'],
      listenerCategories: ['online', 'visibilitychange'],
      schedulerTypes: ['global-sync'],
      storage: storage({}),
      windowRef: { navigator: { onLine: true } },
      documentRef: { visibilityState: 'visible' },
    })

    expect(summary.lazyChunkCount).toBe(4)
    expect(summary.analyticsCache.limit).toBeGreaterThan(0)
    expect(summary.online).toBe(true)
    expect(JSON.stringify(summary)).not.toMatch(/email|token|session|raw meal|89\.6/)
  })
})
