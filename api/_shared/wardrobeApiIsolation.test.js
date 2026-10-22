import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { wardrobeInventory } from '../../scripts/auditWardrobeIsolation.mjs'
import { wardrobeIsolationFixtures as base } from '../../scripts/wardrobeIsolationFixtures.mjs'
import { createSupabaseAdminClient, getSupabaseAdminConfig, setSupabaseAdminClientForTests, clearSupabaseAdminClientForTests } from './supabaseServer.js'
import { setSupabaseAuthVerifierForTests, verifySupabaseUser } from './verifySupabaseUser.js'
import { callOpenAiJson, createRealtimeVoiceSession } from './openaiGateway.js'
import { createCostStoreFromEnv } from './aiHelp/supabaseCostStore.js'
import { createSumUpHttpTransport } from './billing/providers/sumup.js'
import { getGoogleIdToken } from './googleIdToken.js'
import { fetchProviderJson } from './aiEarProviderRoute.js'

const inventory = wardrobeInventory()
function response() {
  return { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value }, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
}
function environment(env) {
  for (const key of Object.keys(base)) vi.stubEnv(key, env[key])
  vi.stubEnv('OPENAI_API_KEY', 'synthetic-inherited-provider-key')
  vi.stubEnv('SUPABASE_URL', 'https://production.invalid')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-global-server-key')
  vi.stubEnv('AI_HELP_COST_SUPABASE_URL', 'https://production.invalid')
  vi.stubEnv('RESEND_API_KEY', 'synthetic-mail-key')
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); setSupabaseAuthVerifierForTests(null); clearSupabaseAdminClientForTests() })

describe('all wardrobe API entrances deny before side effects', () => {
  it.each(inventory.deployable)('%s rejects methods, missing markers and invalid configuration before reading request/auth', async (path) => {
    const network = vi.fn(() => { throw Error('network_forbidden') }); vi.stubGlobal('fetch', network)
    const auth = vi.fn(() => { throw Error('auth_forbidden') }); setSupabaseAuthVerifierForTests(auth)
    const db = new Proxy({}, { get() { throw Error('db_forbidden') } }); setSupabaseAdminClientForTests(db)
    const { default: handler } = await import(/* @vite-ignore */ `../../${path}`)
    const variants = [base, {}, { ...base, VERCEL_ENV: undefined }, { ...base, VERCEL_GIT_COMMIT_REF: undefined }, { ...base, WARDROBE_STAGING_AI_DISABLED: 'false' }, { ...base, WARDROBE_STAGING_SUPABASE_URL: 'https://production.invalid' }]
    for (const env of variants) {
      environment(env)
      for (const method of ['GET', 'POST', 'DELETE', 'OPTIONS']) {
        const request = new Proxy({}, { get(_target, name) { if (name === 'method') return method; throw Error('request_read_before_denial') } })
        const result = response(); await handler(request, result)
        expect(result.statusCode).toBe(503)
        expect(result.body.error.code).toBe('WARDROBE_STAGING_API_DISABLED')
        expect(result.headers['Cache-Control']).toBe('no-store')
      }
    }
    expect(network).not.toHaveBeenCalled(); expect(auth).not.toHaveBeenCalled()
  })
  it.each(inventory.rewrites)('rewrite $source cannot bypass the physical entrance', async ({ source, destination }) => {
    environment(base)
    const path = destination.split('?')[0].slice(1) + '/index.js'
    expect(inventory.deployable).toContain(path)
    const { default: handler } = await import(/* @vite-ignore */ `../../${path}`)
    const result = response()
    await handler({ method: 'POST', url: source + '?__vk_route=webhook', query: { __vk_route: 'support-alerts' }, headers: { authorization: 'Bearer synthetic' } }, result)
    expect(result.statusCode).toBe(503)
  })
  it('also denies direct shared clients/providers and ignores injected auth/DB overrides', async () => {
    environment(base)
    const network = vi.fn(() => { throw Error('network_forbidden') }); vi.stubGlobal('fetch', network)
    const verifier = vi.fn(); setSupabaseAuthVerifierForTests(verifier); setSupabaseAdminClientForTests({ sentinel: true })
    expect(createSupabaseAdminClient()).toBeNull()
    expect(getSupabaseAdminConfig()).toEqual({ url: '', serviceRoleKey: '' })
    expect((await verifySupabaseUser({}, { verifier })).status).toBe(503)
    expect((await callOpenAiJson({ fetchImpl: network })).ok).toBe(false)
    expect((await createRealtimeVoiceSession({ fetchImpl: network })).available).toBe(false)
    expect((await createCostStoreFromEnv().reserve({})).ok).toBe(false)
    await expect(createSumUpHttpTransport({ apiKey: 'synthetic', fetchImpl: network }).createCheckout({})).rejects.toThrow('wardrobe_offline')
    await expect(getGoogleIdToken({ env: base, audience: 'https://synthetic.invalid', fetchImpl: network })).rejects.toThrow('wardrobe_offline')
    await expect(fetchProviderJson('https://synthetic.invalid', {}, { fetchImpl: network })).rejects.toThrow('wardrobeOffline')
    expect(network).not.toHaveBeenCalled(); expect(verifier).not.toHaveBeenCalled()
  })
  it.each(['aiHelp/httpHandler', 'aiCoach/httpHandler', 'aiHelp/supportHandler', 'aiHelp/supportAlertsHandler', 'bugMonitor/httpHandler', 'security/securityCenterHandler', 'aiEarHummingRoute'])('direct shared handler %s cannot bypass the entry guard', async (path) => {
    environment(base)
    const network = vi.fn(() => { throw Error('network_forbidden') }); vi.stubGlobal('fetch', network)
    const { default: handler } = await import(/* @vite-ignore */ `./${path}.js`)
    const result = response()
    await handler(new Proxy({}, { get() { throw Error('request_read_before_denial') } }), result)
    expect(result.statusCode).toBe(503)
    expect(network).not.toHaveBeenCalled()
  })
  it('keeps inventory exhaustive and guard first in every deployable handler', () => {
    expect(inventory.deployable).toHaveLength(12)
    for (const path of inventory.deployable) {
      const code = readFileSync(path, 'utf8')
      expect(code).toMatch(/export default async function handler\(request, response\) \{\s*if \(blockWardrobeApi\(response\)\) return/)
    }
  })
})
