import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler, { sanitizeCoachRecommendations } from './index.js'
import { setAiRateLimitAdapterForTests } from '../_shared/aiRateLimiter.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'

function createRequest({ body = {}, method = 'POST', token = 'valid-token' } = {}) {
  const requestBody = JSON.stringify(body)
  const request = Readable.from([requestBody])
  request.body = requestBody
  request.headers = token ? { authorization: `Bearer ${token}` } : {}
  request.method = method
  request.socket = { remoteAddress: '127.0.0.1' }
  return request
}

function createResponse() {
  const response = {
    body: null,
    headers: {},
    statusCode: 200,
    json: vi.fn((body) => {
      response.body = body
      return response
    }),
    setHeader: vi.fn((name, value) => {
      response.headers[name] = value
    }),
    status: vi.fn((statusCode) => {
      response.statusCode = statusCode
      return response
    }),
  }
  return response
}

async function callRoute(request) {
  const response = createResponse()
  await handler(request, response)
  return response
}

describe('legacy AI API route', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
    setAiRateLimitAdapterForTests()
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'valid-token'
        ? { user: { id: 'ai-user-a' } }
        : { error: { message: token === 'expired-token' ? 'JWT expired' : 'invalid' } }
    ))
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
    setAiRateLimitAdapterForTests()
    setSupabaseAuthVerifierForTests(null)
  })

  it('accepts POST only and sets no-store headers', async () => {
    const response = await callRoute(createRequest({ method: 'GET' }))

    expect(response.statusCode).toBe(405)
    expect(response.body.error.code).toBe('INVALID_REQUEST')
    expect(response.headers['Cache-Control']).toContain('no-store')
  })

  it('requires verified Supabase auth before provider calls', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)

    const missing = await callRoute(createRequest({ body: { action: 'daily-coach' }, token: '' }))
    const expired = await callRoute(createRequest({ body: { action: 'daily-coach' }, token: 'expired-token' }))

    expect(missing.statusCode).toBe(401)
    expect(missing.body.error.code).toBe('AUTH_REQUIRED')
    expect(expired.statusCode).toBe(401)
    expect(expired.body.error.code).toBe('AUTH_EXPIRED')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(JSON.stringify(missing.body)).not.toMatch(/test-key|Bearer|ai-user-a/)
  })

  it('keeps existing mock fallback when provider key is missing', async () => {
    delete process.env.OPENAI_API_KEY
    const response = await callRoute(createRequest({ body: { action: 'daily-coach' } }))

    expect(response.statusCode).toBe(200)
    expect(response.body.source).toBe('mock')
    expect(response.body.summary).toBeTruthy()
    expect(response.headers['Cache-Control']).toContain('no-store')
  })

  it('applies server-side rate limiting after auth', async () => {
    setAiRateLimitAdapterForTests({
      consume: vi.fn(() => ({
        limited: true,
        retryAfterSeconds: 30,
        resetAt: Date.now() + 30000,
      })),
      type: 'test',
    })
    const response = await callRoute(createRequest({ body: { action: 'daily-coach' } }))

    expect(response.statusCode).toBe(429)
    expect(response.body.error.code).toBe('RATE_LIMITED')
    expect(response.headers['Retry-After']).toBe('30')
  })

  it('sanitizes structured coach recommendations before returning provider output', () => {
    const recommendations = sanitizeCoachRecommendations([
      {
        action: 'Lägg till protein i nästa måltid.',
        category: 'protein',
        confidence: 'certain',
        evidence: [
          { provenance: 'ai_estimated', text: 'Protein idag är under mål.' },
          { provenance: 'unknown', text: 'Måltider finns i dagens logg.' },
        ],
        id: 'rec-1',
        priority: 'urgent',
        reasoningSummary: 'Rådet bygger på registrerad matdata.',
        title: 'Stärk måltiden',
      },
      {
        action: 'Du måste gå ner exakt kroppsfett snabbt.',
        category: 'weight',
        reasoningSummary: 'Garanterat resultat.',
        title: 'Extrem plan',
      },
    ])

    expect(recommendations).toHaveLength(1)
    expect(recommendations[0]).toMatchObject({
      action: 'Lägg till protein i nästa måltid.',
      category: 'protein',
      confidence: 'medium',
      priority: 'medium',
      title: 'Stärk måltiden',
    })
    expect(recommendations[0].evidence).toEqual([
      { provenance: 'ai_estimated', text: 'Protein idag är under mål.' },
      { provenance: 'derived', text: 'Måltider finns i dagens logg.' },
    ])
    expect(JSON.stringify(recommendations)).not.toMatch(/garanterat|exakt kroppsfett/i)
  })

  it('prefers OpenAI for chat instead of a canned greeting', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          reply: 'Hej Hassan. Senaste vikten är 83,8 kg. Vill du kolla protein eller middag?',
        }),
      }),
    }))

    const response = await callRoute(createRequest({
      body: {
        action: 'chat',
        message: 'Hej',
        profile: { name: 'Hassan', goalWeight: '78' },
        weights: [{ date: '2026-08-21', value: 83.8 }],
      },
    }))

    expect(response.statusCode).toBe(200)
    expect(response.body.source).toBe('openai')
    expect(response.body.reply).toContain('83,8')
    expect(fetch).toHaveBeenCalled()
  })
})
