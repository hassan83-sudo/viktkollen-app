import { afterEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ value: { authorizationHeader: 'Bearer t', ok: true } }))
vi.mock('../ai/aiAuthTransport.js', () => ({ getCurrentAiAuthorization: async () => auth.value }))

const { loadFeatureAccess } = await import('./featureAccessClient.js')

const respond = (status, body) => vi.fn(async () => ({ json: async () => body, ok: status === 200, status }))

afterEach(() => {
  auth.value = { authorizationHeader: 'Bearer t', ok: true }
})

describe('behörighet från /api/billing/capability', () => {
  it('räknar bara serverns uttryckliga allowed som godkänt, allt annat är låst', async () => {
    await expect(loadFeatureAccess('aiEar', { fetchImpl: respond(200, { features: { aiEar: 'allowed' }, ok: true }) })).resolves.toBe('allowed')
    await expect(loadFeatureAccess('aiEar', { fetchImpl: respond(200, { features: { aiEar: 'locked' }, ok: true }) })).resolves.toBe('locked')
    // Äldre serversvar utan features, även för admin: låst.
    await expect(loadFeatureAccess('aiEar', { fetchImpl: respond(200, { billing_admin: true, ok: true }) })).resolves.toBe('locked')
    await expect(loadFeatureAccess('aiEar', { fetchImpl: respond(500, { features: { aiEar: 'allowed' } }) })).resolves.toBe('locked')
    await expect(loadFeatureAccess('aiEar', { fetchImpl: vi.fn(async () => { throw new Error('offline') }) })).resolves.toBe('locked')
  })

  it('frågar inte servern utan inloggning', async () => {
    auth.value = { ok: false }
    const fetchImpl = vi.fn()
    await expect(loadFeatureAccess('aiEar', { fetchImpl })).resolves.toBe('locked')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
