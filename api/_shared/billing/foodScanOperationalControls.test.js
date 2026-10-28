import { describe, expect, it } from 'vitest'
import { loadFoodScanOperationalControls } from './foodScanLiveBilling.js'

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
function client(results, started) {
  return {
    schema(name) {
      expect(name).toBe('billing')
      return {
        from(table) {
          return { select() { return this }, eq() { return this }, maybeSingle() {
            started.push(table)
            return results[table].promise
          } }
        },
      }
    },
  }
}

describe('food scan operational controls', () => {
  it('starts both independent reads immediately and waits for both results', async () => {
    const results = { feature_controls: deferred(), provider_controls: deferred() }
    const started = []
    let finished = false
    const promise = loadFoodScanOperationalControls(client(results, started)).then((value) => { finished = true; return value })
    expect(started).toEqual(['feature_controls', 'provider_controls'])
    results.feature_controls.resolve({ data: { mode: 'ENFORCE' }, error: null })
    await Promise.resolve()
    await Promise.resolve()
    expect(finished).toBe(false)
    results.provider_controls.resolve({ data: { mode: 'DISABLED' }, error: null })
    expect(await promise).toEqual({ featureControl: { mode: 'ENFORCE' }, providerControls: [{ mode: 'DISABLED' }] })
  })

  it.each(['feature_controls', 'provider_controls'])('rejects failed %s without returning partial controls', async (failedTable) => {
    const results = { feature_controls: deferred(), provider_controls: deferred() }
    const promise = loadFoodScanOperationalControls(client(results, []))
    const assertion = expect(promise).rejects.toMatchObject({ code: 'READ_FAILED' })
    for (const [table, result] of Object.entries(results)) {
      result.resolve(table === failedTable ? { error: { code: 'READ_FAILED', message: 'failed' } } : { data: { mode: 'ENFORCE' }, error: null })
    }
    await assertion
  })

  it('preserves missing-row handling', async () => {
    const results = { feature_controls: deferred(), provider_controls: deferred() }
    const promise = loadFoodScanOperationalControls(client(results, []))
    for (const result of Object.values(results)) result.resolve({ data: null, error: null })
    expect(await promise).toEqual({ featureControl: null, providerControls: [] })
  })
})
