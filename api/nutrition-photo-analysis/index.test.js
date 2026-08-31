import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler, { NUTRITION_PHOTO_ANALYSIS_TIMEOUT_MS, nutritionPhotoRouteInternals } from './index.js'
import { setAiRateLimitAdapterForTests } from '../_shared/aiRateLimiter.js'
import { resetAiRequestDeduperForTests } from '../_shared/aiRequestDeduper.js'
import { setSupabaseAuthVerifierForTests } from '../_shared/verifySupabaseUser.js'
import { analysisConsentPurposes, computeCanonicalImageHash, issueAnalysisConsentToken } from '../_shared/analysisConsent.js'

const TEST_SECRET = 'test-analysis-consent-secret-32-plus'
const USER_ID = 'photo-user-a'
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

function consentHeadersForPhoto(image = pngBytes) {
  process.env.ANALYSIS_CONSENT_SECRET = TEST_SECRET
  const issued = issueAnalysisConsentToken({
    env: { ANALYSIS_CONSENT_SECRET: TEST_SECRET },
    imageHash: computeCanonicalImageHash([{ bytes: image, label: 'image' }]),
    purpose: analysisConsentPurposes.nutritionPhotoAnalysis,
    userId: USER_ID,
  })

  expect(issued.ok).toBe(true)
  return { 'x-viktkollen-consent-token': issued.token }
}

function multipartBody({ boundary = 'test-boundary', contentType = 'image/png', fieldName = 'image', image = pngBytes } = {}) {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="mealType"\r\n\r\nLunch\r\n`, 'latin1'),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="meal.png"\r\nContent-Type: ${contentType}\r\n\r\n`, 'latin1'),
    image,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'latin1'),
  ])
}

function createRequest({ body, contentType = 'multipart/form-data; boundary=test-boundary', headers = {}, method = 'POST', token = 'valid-token' } = {}) {
  const request = Readable.from(body ? [body] : [])
  request.method = method
  request.headers = {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    'content-type': contentType,
    'x-viktkollen-client-id': `test-${Math.random()}`,
    ...headers,
  }
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

describe('nutrition photo analysis API route', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
    resetAiRequestDeduperForTests()
    setAiRateLimitAdapterForTests()
    setSupabaseAuthVerifierForTests(async (token) => (
      token === 'valid-token'
        ? { user: { id: USER_ID } }
        : { error: { message: token === 'expired-token' ? 'JWT expired' : 'invalid' } }
    ))
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.useRealTimers()
    vi.unstubAllGlobals()
    setSupabaseAuthVerifierForTests(null)
    setAiRateLimitAdapterForTests()
    resetAiRequestDeduperForTests()
  })

  it('accepts POST only', async () => {
    const response = await callRoute(createRequest({ method: 'GET' }))

    expect(response.statusCode).toBe(405)
    expect(response.body.error.code).toBe('INVALID_REQUEST')
    expect(response.headers['Cache-Control']).toContain('no-store')
  })

  it('requires auth before reading or sending image data', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const response = await callRoute(createRequest({ body: multipartBody(), token: '' }))

    expect(response.statusCode).toBe(401)
    expect(response.body.error.code).toBe('AUTH_REQUIRED')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(JSON.stringify(response.body)).not.toMatch(/test-key|Bearer|photo-user-a|base64/)
  })

  it('rejects invalid and expired auth without provider calls', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)

    const invalid = await callRoute(createRequest({ body: multipartBody(), token: 'bad-token' }))
    const expired = await callRoute(createRequest({ body: multipartBody(), token: 'expired-token' }))

    expect(invalid.statusCode).toBe(401)
    expect(invalid.body.error.code).toBe('AUTH_INVALID')
    expect(expired.statusCode).toBe(401)
    expect(expired.body.error.code).toBe('AUTH_EXPIRED')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects invalid content type before reading image data', async () => {
    const response = await callRoute(createRequest({ contentType: 'application/json' }))

    expect(response.statusCode).toBe(415)
    expect(response.body.error.code).toBe('INVALID_REQUEST')
    expect(JSON.stringify(response.body)).not.toMatch(/base64|OPENAI|stack/)
  })

  it('rejects missing image', async () => {
    const response = await callRoute(createRequest({ body: multipartBody({ fieldName: 'other' }) }))

    expect(response.statusCode).toBe(400)
    expect(response.body.error.code).toBe('INVALID_REQUEST')
  })

  it('rejects MIME spoofing through file signature validation', () => {
    const error = nutritionPhotoRouteInternals.validateImage({
      contentType: 'image/png',
      data: Buffer.from('not-a-png'),
      size: 9,
    })

    expect(error.code).toBe('unsupportedFormat')
  })

  it('returns configuration error when provider key is missing', async () => {
    delete process.env.OPENAI_API_KEY
    const response = await callRoute(createRequest({
      body: multipartBody(),
      headers: consentHeadersForPhoto(),
    }))

    expect(response.statusCode).toBe(503)
    expect(response.body.error.code).toBe('PROVIDER_NOT_CONFIGURED')
    expect(JSON.stringify(response.body)).not.toMatch(/OPENAI_API_KEY|Bearer|base64/)
  })

  it('treats an empty provider key as not configured', async () => {
    process.env.OPENAI_API_KEY = ''
    const response = await callRoute(createRequest({
      body: multipartBody(),
      headers: consentHeadersForPhoto(),
    }))

    expect(response.statusCode).toBe(503)
    expect(response.body.error.code).toBe('PROVIDER_NOT_CONFIGURED')
    expect(JSON.stringify(response.body)).not.toMatch(/OPENAI_API_KEY|Bearer|base64/)
  })

  it('uses a nutrition-photo specific 45s provider timeout', () => {
    expect(NUTRITION_PHOTO_ANALYSIS_TIMEOUT_MS).toBe(45000)
  })

  it('prompts the model to use component-first analysis with a second visual pass', () => {
    const prompt = nutritionPhotoRouteInternals.createPrompt('Lunch')

    expect(prompt).toContain('component-first')
    expect(prompt).toContain('second visual pass')
    expect(prompt).toContain('missad sås/dipp/dressing')
    expect(prompt).toContain('glans eller olja/fett')
    expect(prompt).toContain('panering/fritering')
    expect(prompt).toContain('dubbelräkning')
    expect(prompt).toContain('portion')
  })

  it('prompts visible sauces to remain separate components with alternatives when identity is uncertain', () => {
    const prompt = nutritionPhotoRouteInternals.createPrompt('Lunch')

    expect(prompt).toContain('Synlig separat sås/dressing/dipp ska alltid vara egen komponent')
    expect(prompt).toContain('Krämig sås')
    expect(prompt).toContain('alternatives')
    expect(prompt).toContain('Hög confidence på att sås finns')
    expect(prompt).toContain('medium/low confidence')
  })

  it('prompts fried and breaded foods to account for fat without double-counting oil', () => {
    const prompt = nutritionPhotoRouteInternals.createPrompt('Lunch')

    expect(prompt).toContain('fried, breaded, battered eller oil-coated')
    expect(prompt).toContain('tillagningsfett/panering')
    expect(prompt).toContain('Undvik dubbelräkning')
    expect(prompt).toContain('separat synligt fett/olja')
  })

  it('prompts countable foods, plate-relative portions and visual inventory without merging separate foods', () => {
    const prompt = nutritionPhotoRouteInternals.createPrompt('Lunch')

    expect(prompt).toContain('identityConfidence')
    expect(prompt).toContain('pieceCountConfidence')
    expect(prompt).toContain('Pass 1 visuell inventering')
    expect(prompt).toContain('pieceCount')
    expect(prompt).toContain('relativePlateShare')
    expect(prompt).toContain('Slå inte ihop visuellt separata livsmedel')
    expect(prompt).toContain('Hitta inte på exakt tallriksdiameter')
    expect(prompt).toContain('detail')
  })

  it('validates provider payload and strips unsafe fields', () => {
    const result = nutritionPhotoRouteInternals.validateProviderPayload({
      detectedItems: Array.from({ length: 14 }, (_, index) => ({
        calories: -1,
        name: index === 0 ? '<script>Pizza</script>' : `Mat ${index}`,
        protein: 8,
      })),
      estimatedNutrition: {
        calories: { confidence: 'medium', max: 620, midpoint: 500, min: 420 },
        carbsG: { confidence: 'medium', max: 68, midpoint: 55, min: 42 },
        fatG: { confidence: 'low', max: 28, midpoint: 18, min: 11 },
        proteinG: { confidence: 'medium', max: 32, midpoint: 24, min: 18 },
      },
      portionEstimate: { confidence: 'medium', description: 'Normal tallrik', gramsMax: 520, gramsMin: 360 },
      safeSummary: 'Se https://example.com <b>test</b>',
    })

    expect(result.ok).toBe(true)
    expect(result.analysis.detectedItems).toHaveLength(12)
    expect(result.analysis.detectedItems[0].calories).toBeNull()
    expect(result.analysis.estimatedNutrition.calories).toMatchObject({ max: 620, midpoint: 500, min: 420 })
    expect(result.analysis.nutrition.protein).toBe(24)
    expect(result.analysis.portionEstimate.gramsMin).toBe(360)
    expect(JSON.stringify(result.analysis)).not.toMatch(/<script|https?:\/\//)
  })

  it('rejects provider payloads without usable nutrition ranges', () => {
    const result = nutritionPhotoRouteInternals.validateProviderPayload({
      detectedItems: [{ confidence: 'medium', name: 'Pizza' }],
      estimatedNutrition: { calories: null, proteinG: null },
    })

    expect(result.ok).toBe(false)
    expect(result.errors).toContain('estimatedNutrition')
  })

  it('sanitizes V3 component payloads for fried chicken, fries, vegetables and sauce', () => {
    const result = nutritionPhotoRouteInternals.validateProviderPayload({
      components: [
        {
          category: 'protein',
          confidence: 'high',
          cookingMethods: ['fried', 'breaded'],
          name: 'Friterad kyckling',
          nutritionEstimate: {
            calories: { confidence: 'medium', max: 380, midpoint: 310, min: 250 },
            fatG: { confidence: 'medium', max: 22, midpoint: 16, min: 10 },
            proteinG: { confidence: 'medium', max: 36, midpoint: 28, min: 22 },
          },
          portionEstimate: { confidence: 'medium', gramsMax: 150, gramsMin: 100 },
          visualEvidence: 'Panerad/friterad yta.',
        },
        {
          category: 'carbohydrate',
          confidence: 'high',
          name: 'French fries',
          nutritionEstimate: {
            calories: { confidence: 'medium', max: 520, midpoint: 430, min: 340 },
            carbsG: { confidence: 'medium', max: 70, midpoint: 55, min: 42 },
            fatG: { confidence: 'medium', max: 25, midpoint: 18, min: 12 },
            proteinG: { confidence: 'low', max: 7, midpoint: 5, min: 3 },
          },
          portionEstimate: { confidence: 'medium', gramsMax: 180, gramsMin: 120 },
        },
        {
          category: 'vegetables',
          confidence: 'high',
          name: 'Gurka och tomat',
          nutritionEstimate: {
            calories: { confidence: 'medium', max: 35, midpoint: 22, min: 12 },
            carbsG: { confidence: 'medium', max: 7, midpoint: 4, min: 2 },
            fiberG: { confidence: 'medium', max: 3, midpoint: 1.5, min: 0.5 },
            proteinG: { confidence: 'low', max: 2, midpoint: 1, min: 0.2 },
          },
          portionEstimate: { confidence: 'medium', gramsMax: 60, gramsMin: 30 },
        },
        {
          alternatives: ['vitlökssås', 'majonnäsbaserad dressing', 'yoghurtsås', 'för många ignoreras'],
          category: 'sauce',
          confidence: 'medium',
          name: 'Sås eller dressing',
          nutritionEstimate: {
            calories: { confidence: 'low', max: 180, midpoint: 105, min: 50 },
            fatG: { confidence: 'low', max: 18, midpoint: 10, min: 4 },
          },
          portionEstimate: { confidence: 'low', gramsMax: 40, gramsMin: 20 },
          uncertainty: { confidence: 'low', reason: 'Exakt typ och mängd är osäker.' },
        },
      ],
      confidence: 'medium',
      imageQuality: 'usable',
      mealTotals: {
        calories: { confidence: 'medium', max: 1115, midpoint: 867, min: 652 },
        carbsG: { confidence: 'medium', max: 77, midpoint: 59, min: 44 },
        fatG: { confidence: 'medium', max: 65, midpoint: 44, min: 26 },
        proteinG: { confidence: 'medium', max: 45, midpoint: 34, min: 25 },
      },
      safeSummary: 'Fyra synliga komponenter med osäker sås.',
    })

    expect(result.ok).toBe(true)
    expect(result.analysis.components).toHaveLength(4)
    expect(result.analysis.components[1]).toMatchObject({ category: 'carbohydrate', confidence: 'high', name: 'French fries' })
    expect(result.analysis.components[1]).toMatchObject({
      matchedFood: { id: 'pommes', name: 'Pommes' },
      nutritionSource: 'databaseDerived',
    })
    expect(result.analysis.components[3].alternatives).toHaveLength(3)
    expect(result.analysis.imageQuality).toBe('usable')
    expect(result.analysis.estimatedNutrition.calories.midpoint).not.toBe(867)
    expect(JSON.stringify(result.analysis)).not.toMatch(/data:image|base64|OPENAI/)
  })

  it('drops unusable component totals and recalculates mismatched meal totals from components', () => {
    const result = nutritionPhotoRouteInternals.validateProviderPayload({
      components: [
        {
          category: 'unknown',
          confidence: 'low',
          name: '<script>Okänd komponent</script>',
          nutritionEstimate: {
            calories: { max: 620, midpoint: 520, min: 420 },
            carbsG: { max: 60, midpoint: 45, min: 30 },
            fatG: { max: 22, midpoint: 14, min: 8 },
            proteinG: { max: 30, midpoint: 20, min: 10 },
          },
        },
      ],
      confidence: 'medium',
      imageQuality: 'screen',
      mealTotals: {
        calories: { max: 160, midpoint: 120, min: 80 },
        carbsG: { max: 10, midpoint: 6, min: 3 },
        fatG: { max: 5, midpoint: 3, min: 1 },
        proteinG: { max: 4, midpoint: 2, min: 1 },
      },
    })

    expect(result.ok).toBe(true)
    expect(result.analysis.estimatedNutrition.calories.midpoint).toBe(520)
    expect(result.analysis.totalsValidation.isConsistent).toBe(false)
    expect(result.analysis.imageQuality).toBe('usable')
    expect(JSON.stringify(result.analysis)).not.toMatch(/<script/)
  })

  it('preserves portion uncertainty and raw alternatives while deriving totals from components', () => {
    const result = nutritionPhotoRouteInternals.validateProviderPayload({
      components: [
        {
          alternatives: ['mayonnaise', 'aioli', 'yoghurt sauce'],
          category: 'sauce',
          confidence: 'high',
          name: 'Krämig sås',
          nutritionEstimate: {
            calories: { confidence: 'low', max: 210, midpoint: 120, min: 40 },
            carbsG: { confidence: 'low', max: 5, midpoint: 2, min: 0 },
            fatG: { confidence: 'low', max: 22, midpoint: 12, min: 2 },
            proteinG: { confidence: 'low', max: 4, midpoint: 2, min: 0 },
          },
          portionEstimate: { confidence: 'low', description: 'Liten klick', gramsMax: 45, gramsMin: 15 },
          uncertainty: { confidence: 'low', reason: 'Synlig krämig sås, exakt typ osäker.' },
        },
        {
          category: 'protein',
          confidence: 'high',
          cookingMethods: ['fried', 'breaded'],
          name: 'Fried chicken',
          nutritionEstimate: {
            calories: { confidence: 'medium', max: 430, midpoint: 340, min: 260 },
            carbsG: { confidence: 'medium', max: 22, midpoint: 14, min: 8 },
            fatG: { confidence: 'medium', max: 26, midpoint: 18, min: 11 },
            proteinG: { confidence: 'medium', max: 38, midpoint: 30, min: 22 },
          },
          portionEstimate: { confidence: 'medium', description: 'Synlig filébit', gramsMax: 160, gramsMin: 105 },
        },
      ],
      confidence: 'medium',
      mealTotals: {
        calories: { confidence: 'medium', max: 1400, midpoint: 1200, min: 1000 },
        carbsG: { confidence: 'medium', max: 140, midpoint: 120, min: 100 },
        fatG: { confidence: 'medium', max: 90, midpoint: 70, min: 50 },
        proteinG: { confidence: 'medium', max: 80, midpoint: 70, min: 60 },
      },
    })

    expect(result.ok).toBe(true)
    expect(result.analysis.estimatedNutrition.calories.midpoint).toBe(470)
    expect(result.analysis.totalsValidation.isConsistent).toBe(false)
    expect(result.analysis.components.find((component) => component.category === 'sauce')).toMatchObject({
      alternatives: ['mayonnaise', 'aioli', 'yoghurt sauce'],
      category: 'sauce',
      confidence: 'high',
      name: 'Krämig sås',
      portionEstimate: { confidence: 'low' },
    })
    expect(result.analysis.components.find((component) => component.category === 'protein').cookingMethods).toEqual(['fried', 'breaded'])
    expect(result.analysis.components.find((component) => component.category === 'protein').nutritionSource).toBe('aiEstimate')
    expect(result.analysis.components.find((component) => component.category === 'protein').matchedFood).toBeNull()
  })

  it('derives safe database component nutrition and ignores model mealTotals', () => {
    const result = nutritionPhotoRouteInternals.validateProviderPayload({
      components: [
        {
          category: 'protein',
          confidence: 'high',
          name: 'Kyckling',
          portionEstimate: { confidence: 'high', gramsMax: 100, gramsMin: 100 },
        },
        {
          category: 'carbohydrate',
          confidence: 'high',
          name: 'Ris',
          portionEstimate: { confidence: 'medium', gramsMax: 200, gramsMin: 100 },
        },
      ],
      confidence: 'high',
      mealTotals: {
        calories: { max: 1200, midpoint: 1000, min: 800 },
        carbsG: { max: 160, midpoint: 140, min: 120 },
        fatG: { max: 80, midpoint: 60, min: 40 },
        proteinG: { max: 90, midpoint: 80, min: 70 },
      },
    })

    expect(result.ok).toBe(true)
    expect(result.analysis.components.every((component) => component.nutritionSource === 'databaseDerived')).toBe(true)
    expect(result.analysis.estimatedNutrition.calories).toMatchObject({ max: 439, min: 302 })
    expect(result.analysis.estimatedNutrition.calories.midpoint).not.toBe(1000)
    expect(result.analysis.detectedItems.every((item) => item.dataSource === 'databaseDerived')).toBe(true)
  })

  it('returns validated remote analysis without raw provider response', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
        output_text: JSON.stringify({
          detectedItems: [{ calories: 260, carbohydrates: 32, confidence: 'medium', fat: 10, name: 'Pizza', protein: 12 }],
          estimatedNutrition: {
            calories: { confidence: 'medium', max: 340, midpoint: 260, min: 210 },
            carbsG: { confidence: 'medium', max: 40, midpoint: 32, min: 24 },
            fatG: { confidence: 'medium', max: 16, midpoint: 10, min: 7 },
            proteinG: { confidence: 'medium', max: 18, midpoint: 12, min: 8 },
          },
          portionEstimate: { confidence: 'medium', description: 'Slice', gramsMax: 180, gramsMin: 110 },
          safeSummary: 'Uppskattad portion.',
        }),
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await callRoute(createRequest({
      body: multipartBody(),
      headers: consentHeadersForPhoto(),
    }))
    const providerBody = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(response.statusCode).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(response.body.analysis.providerType).toBe('remote')
    expect(response.body.analysis.detectedItems[0].name).toBe('Pizza')
    expect(providerBody.max_output_tokens).toBe(3400)
    expect(JSON.stringify(response.body)).not.toMatch(/test-key|Bearer|output_text|data:image/)
    expect(response.headers['Cache-Control']).toContain('no-store')
  })

  it('logs safe upstream status when OpenAI rejects the provider request', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
        error: {
          code: 'invalid_api_key',
          message: 'unsafe upstream message should not be returned',
        },
      }), { status: 401, statusText: 'Unauthorized' })))

    const response = await callRoute(createRequest({
      body: multipartBody(),
      headers: {
        ...consentHeadersForPhoto(),
        'x-viktkollen-request-id': 'photo-attempt-test',
      },
    }))

    expect(response.statusCode).toBe(502)
    expect(response.body.error.code).toBe('PROVIDER_UNAVAILABLE')
    expect(warn).toHaveBeenCalledWith('[api/nutrition-photo-analysis] Safe failure', expect.objectContaining({
      clientAttemptId: 'photo-attempt-test',
      code: 'PROVIDER_UNAVAILABLE',
      networkError: false,
      timeout: false,
      upstreamErrorCode: 'invalid_api_key',
      upstreamRequestStarted: true,
      upstreamStatus: 401,
      upstreamStatusText: 'Unauthorized',
    }))
    expect(JSON.stringify(response.body)).not.toMatch(/test-key|Bearer|base64|unsafe upstream/)
  })

  it('logs provider 5xx separately from timeout or abort', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'server_error' },
    }), { status: 500, statusText: 'Internal Server Error' })))

    const response = await callRoute(createRequest({
      body: multipartBody(),
      headers: consentHeadersForPhoto(),
    }))

    expect(response.statusCode).toBe(502)
    expect(warn).toHaveBeenCalledWith('[api/nutrition-photo-analysis] Safe failure', expect.objectContaining({
      aborted: false,
      code: 'PROVIDER_UNAVAILABLE',
      networkError: false,
      timeout: false,
      upstreamErrorCode: 'server_error',
      upstreamStatus: 500,
    }))
  })

  it('logs provider parse errors with upstream status instead of network error', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"output_text":', {
      status: 200,
      statusText: 'OK',
    })))

    const response = await callRoute(createRequest({
      body: multipartBody(),
      headers: consentHeadersForPhoto(),
    }))

    expect(response.statusCode).toBe(502)
    expect(response.body.error.code).toBe('PROVIDER_UNAVAILABLE')
    expect(warn).toHaveBeenCalledWith('[api/nutrition-photo-analysis] Safe failure', expect.objectContaining({
      code: 'PROVIDER_UNAVAILABLE',
      networkError: false,
      parseError: true,
      parseErrorCode: 'malformedProviderJson',
      parseErrorName: 'SyntaxError',
      timeout: false,
      upstreamErrorCode: 'malformedProviderJson',
      upstreamStatus: 200,
      upstreamStatusText: 'OK',
    }))
    expect(JSON.stringify(response.body)).not.toMatch(/test-key|Bearer|base64|data:image|output_text/)
  })

  it('logs malformed model output format safely without raw model text', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      incomplete_details: { reason: 'max_output_tokens' },
      output_text: '{"components":[{"name":"Pizza"}]',
      status: 'incomplete',
    }), { status: 200, statusText: 'OK' })))

    const response = await callRoute(createRequest({
      body: multipartBody(),
      headers: consentHeadersForPhoto(),
    }))

    expect(response.statusCode).toBe(502)
    expect(warn).toHaveBeenCalledWith('[api/nutrition-photo-analysis] Safe failure', expect.objectContaining({
      code: 'PROVIDER_UNAVAILABLE',
      containsCodeFence: false,
      endsWithBrace: false,
      networkError: false,
      outputChunkCount: 1,
      outputTextPresent: true,
      parseError: true,
      parseErrorCode: 'truncatedProviderOutput',
      parseErrorName: 'SyntaxError',
      providerIncompleteReason: 'max_output_tokens',
      providerResponseStatus: 'incomplete',
      startsWithBrace: true,
      startsWithCodeFence: false,
      truncatedLikely: true,
      upstreamStatus: 200,
    }))
    expect(JSON.stringify(response.body)).not.toMatch(/test-key|Bearer|base64|data:image|Pizza|components/)
  })

  it('logs safe thrown fetch diagnostics for provider network errors', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const networkError = new TypeError('fetch failed')
    networkError.cause = {
      code: 'UND_ERR_SOCKET',
      message: 'other side closed',
      name: 'SocketError',
    }
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw networkError
    }))

    const response = await callRoute(createRequest({
      body: multipartBody(),
      headers: consentHeadersForPhoto(),
    }))

    expect(response.statusCode).toBe(502)
    expect(response.body.error.code).toBe('PROVIDER_UNAVAILABLE')
    expect(warn).toHaveBeenCalledWith('[api/nutrition-photo-analysis] Safe failure', expect.objectContaining({
      code: 'PROVIDER_UNAVAILABLE',
      fetchErrorCauseCode: 'UND_ERR_SOCKET',
      fetchErrorCauseMessage: 'other side closed',
      fetchErrorCauseName: 'SocketError',
      fetchErrorMessage: 'fetch failed',
      fetchErrorName: 'TypeError',
      networkError: true,
      timeout: false,
      upstreamStatus: '',
    }))
    expect(JSON.stringify(response.body)).not.toMatch(/test-key|Bearer|base64|data:image/)
  })

  it('maps provider timeout to PROVIDER_TIMEOUT instead of generic unavailable', async () => {
    vi.useFakeTimers()
    process.env.OPENAI_API_KEY = 'test-key'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
      setTimeout(() => resolve(new Response(JSON.stringify({
        output_text: '{}',
      }), { status: 200 })), NUTRITION_PHOTO_ANALYSIS_TIMEOUT_MS + 1000)
    })))

    const responsePromise = callRoute(createRequest({
      body: multipartBody(),
      headers: consentHeadersForPhoto(),
    }))
    await vi.advanceTimersByTimeAsync(NUTRITION_PHOTO_ANALYSIS_TIMEOUT_MS)
    const response = await responsePromise

    expect(response.statusCode).toBe(504)
    expect(response.body.error.code).toBe('PROVIDER_TIMEOUT')
    expect(warn).toHaveBeenCalledWith('[api/nutrition-photo-analysis] Safe failure', expect.objectContaining({
      aborted: false,
      code: 'PROVIDER_TIMEOUT',
      networkError: false,
      timeout: true,
      upstreamStatus: '',
    }))
  })

  it('uses separate rate-limit buckets for verified users', async () => {
    setSupabaseAuthVerifierForTests(async (token) => ({ user: { id: token } }))
    setAiRateLimitAdapterForTests({
      consume: vi.fn(() => ({ limited: true, retryAfterSeconds: 12, resetAt: Date.now() + 12000 })),
      type: 'process-local',
    })

    const response = await callRoute(createRequest({ body: multipartBody(), token: 'user-a' }))

    expect(response.statusCode).toBe(429)
    expect(response.body.error.code).toBe('RATE_LIMITED')
    expect(response.body.error.retryAfterSeconds).toBe(12)
    expect(JSON.stringify(response.body)).not.toMatch(/user-a/)
  })
})
