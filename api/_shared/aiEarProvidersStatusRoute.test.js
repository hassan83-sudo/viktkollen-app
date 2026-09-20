import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'

import handler from './aiEarProvidersStatusRoute.js'
import { setAiRateLimitAdapterForTests } from './aiRateLimiter.js'
import { setSupabaseAuthVerifierForTests } from './verifySupabaseUser.js'
import { callRoute } from './aiEarProviderRoute.testkit.js'

function request({ method = 'GET', token = 'valid-token' } = {}) {
  const req = Readable.from([])
  req.method = method
  req.headers = token ? { authorization: `Bearer ${token}` } : {}
  return req
}

describe('AI-örat provider availability route', () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    process.env = { ...originalEnv }
    for (const key of ['AUDD_API_TOKEN', 'ACRCLOUD_HOST', 'ACRCLOUD_ACCESS_KEY', 'ACRCLOUD_ACCESS_SECRET', 'OPENAI_API_KEY']) delete process.env[key]
    setAiRateLimitAdapterForTests()
    setSupabaseAuthVerifierForTests(async (token) => (token === 'valid-token' ? { user: { id: 'u1' } } : { error: { message: 'invalid' } }))
  })
  afterEach(() => {
    process.env = { ...originalEnv }
    setSupabaseAuthVerifierForTests(null)
  })

  it('requires login and GET', async () => {
    expect((await callRoute(handler, request({ token: '' }))).statusCode).toBe(401)
    expect((await callRoute(handler, request({ method: 'POST' }))).statusCode).toBe(405)
  })

  it('reports each provider independently as a boolean and nothing else', async () => {
    process.env.AUDD_API_TOKEN = 'audd-SECRET'
    process.env.ACRCLOUD_HOST = 'host.example.com'
    process.env.ACRCLOUD_ACCESS_KEY = 'key-SECRET'
    const partial = await callRoute(handler, request())
    process.env.ACRCLOUD_ACCESS_SECRET = 'secret-SECRET'
    process.env.OPENAI_API_KEY = 'sk-SECRET'
    const full = await callRoute(handler, request())

    expect(partial.body.providers).toEqual({ humming: false, music: true, transcription: false })
    expect(full.body.providers).toEqual({ humming: true, music: true, transcription: true })
    expect(JSON.stringify([partial.body, full.body])).not.toMatch(/SECRET|host\.example/)
    expect(partial.headers['Cache-Control']).toContain('no-store')
  })
})
