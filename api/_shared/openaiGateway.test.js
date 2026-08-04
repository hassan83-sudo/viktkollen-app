import { describe, expect, it, vi } from 'vitest'
import {
  callOpenAiJson,
  checkRateLimit,
  getAiGatewayConfig,
  openAiGatewayInternals,
  parseJsonResponseText,
} from './openaiGateway.js'

describe('openaiGateway', () => {
  it('reports configured status without exposing key values', () => {
    const config = getAiGatewayConfig('coach', {
      OPENAI_API_KEY: 'secret-value',
      OPENAI_COACH_MODEL: 'server-model',
    })

    expect(config.configured).toBe(true)
    expect(JSON.stringify(config)).not.toContain('secret-value')
    expect(config.model).toBe('server-model')
  })

  it('returns safe missing-key error', async () => {
    const result = await callOpenAiJson({
      env: {},
      fetchImpl: vi.fn(),
      input: [],
    })

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('aiNotConfigured')
    expect(JSON.stringify(result)).not.toMatch(/OPENAI_API_KEY|Bearer/)
  })

  it('parses fenced json response text', () => {
    expect(parseJsonResponseText('```json\n{"ok":true}\n```')).toEqual({ ok: true })
  })

  it('rate limits per anonymous scope', () => {
    openAiGatewayInternals.buckets.clear()

    expect(checkRateLimit({ limit: 1, now: 1, scope: 'a', type: 'coach' }).limited).toBe(false)
    expect(checkRateLimit({ limit: 1, now: 2, scope: 'a', type: 'coach' }).limited).toBe(true)
    expect(checkRateLimit({ limit: 1, now: 3, scope: 'b', type: 'coach' }).limited).toBe(false)
  })

  it('calls provider with server-selected model and max output', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      output_text: JSON.stringify({ summary: 'ok' }),
    }), { status: 200 }))
    const result = await callOpenAiJson({
      env: { OPENAI_API_KEY: 'secret', OPENAI_COACH_MODEL: 'server-model' },
      fetchImpl,
      input: [{ role: 'user', content: [{ text: 'safe', type: 'input_text' }] }],
      maxOutputTokens: 100,
    })
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)

    expect(result.ok).toBe(true)
    expect(body.model).toBe('server-model')
    expect(body.max_output_tokens).toBe(100)
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer secret')
  })
})
