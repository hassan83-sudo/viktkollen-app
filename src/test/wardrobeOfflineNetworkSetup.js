import { afterAll } from 'vitest'
// Fail before network dispatch. Tests may supply explicit in-memory fetch mocks.
const originalFetch = globalThis.fetch
globalThis.fetch = () => { throw new Error('offline_test_real_network_forbidden') }
afterAll(() => { globalThis.fetch = originalFetch })
