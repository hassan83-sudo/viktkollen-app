import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler, { adaptiveCoachRouteInternals } from './index.js'

function createRequest({ body = {}, contentType = 'application/json', headers = {}, method = 'POST' } = {}) {
  const request = Readable.from([JSON.stringify(body)])
  request.headers = {
    'content-type': contentType,
    'x-viktkollen-client-id': 'test-client',
    ...headers,
  }
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

describe('adaptive coach API route', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
  })

  it('is POST only', async () => {
    const response = await callRoute(createRequest({ method: 'GET' }))

    expect(response.statusCode).toBe(405)
    expect(response.body.error.code).toBe('invalidRequest')
  })

  it('requires json content type and consent', async () => {
    const invalidType = await callRoute(createRequest({ contentType: 'text/plain' }))
    const noConsent = await callRoute(createRequest({ body: { coverage: 0.8, confidence: 0.8 } }))

    expect(invalidType.statusCode).toBe(415)
    expect(noConsent.statusCode).toBe(403)
    expect(noConsent.body.error.code).toBe('consentRequired')
  })

  it('blocks raw sensitive fields', () => {
    expect(adaptiveCoachRouteInternals.hasBlockedFields({ session: 'x' })).toBe(true)
    expect(adaptiveCoachRouteInternals.hasBlockedFields({ rawMeals: [] })).toBe(true)
    expect(adaptiveCoachRouteInternals.hasBlockedFields({ coverage: 0.7 })).toBe(false)
  })

  it('returns low coverage before provider call', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const response = await callRoute(createRequest({ body: { consent: true, confidence: 0.1, coverage: 0.1 } }))

    expect(response.statusCode).toBe(422)
    expect(response.body.error.code).toBe('lowCoverage')
  })

  it('returns safe missing provider config', async () => {
    delete process.env.OPENAI_API_KEY
    const response = await callRoute(createRequest({ body: { consent: true, confidence: 0.8, coverage: 0.8 } }))

    expect(response.statusCode).toBe(503)
    expect(response.body.error.code).toBe('aiNotConfigured')
    expect(JSON.stringify(response.body)).not.toMatch(/OPENAI_API_KEY|Bearer|test-key/)
  })

  it('returns validated coach response without raw provider output', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      output_text: JSON.stringify({
        confidence: 0.72,
        dataUsed: ['weight trend', 'nutrition summary'],
        recommendations: [{
          category: 'nutrition',
          confidence: 0.7,
          description: 'Lägg till en enkel proteinkälla i nästa måltid.',
          id: 'protein',
          priority: 80,
          reason: 'Proteinmålet verkar behöva stöd.',
          requiresConfirmation: true,
          safetyCategory: 'standard',
          sourceFacts: ['nutrition summary'],
          suggestedActionType: 'habit',
          title: 'Stärk proteinbasen',
        }],
        safetyNote: 'Inte medicinsk rådgivning.',
        summary: 'Ett lugnt nästa steg finns.',
      }),
    }), { status: 200 })))

    const response = await callRoute(createRequest({ body: { consent: true, confidence: 0.8, coverage: 0.8 } }))

    expect(response.statusCode).toBe(200)
    expect(response.body.coach.recommendations).toHaveLength(1)
    expect(JSON.stringify(response.body)).not.toMatch(/test-key|Bearer|output_text/)
  })
})
