/* global process */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { analyzeBodyImages } from './bodyAnalysisAi.js'

const originalEnv = process.env

beforeEach(() => {
  process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key' }
})

afterEach(() => {
  process.env = originalEnv
  vi.unstubAllGlobals()
})

describe('body analysis AI privacy', () => {
  it('explicitly disables provider-side response storage for body images', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ output_text: JSON.stringify({ summary: 'ok' }) }),
      ok: true,
    })
    vi.stubGlobal('fetch', fetchMock)

    await analyzeBodyImages(
      { dataUrl: 'data:image/jpeg;base64,front' },
      { dataUrl: 'data:image/jpeg;base64,side' },
      { dataUrl: 'data:image/jpeg;base64,back' },
      'Analyze safely',
    )

    const [, options] = fetchMock.mock.calls[0]
    const requestBody = JSON.parse(options.body)

    expect(requestBody.store).toBe(false)
    expect(options.method).toBe('POST')
  })
})
