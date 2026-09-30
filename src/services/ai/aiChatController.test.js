import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { requestAiEndpoint } from '../aiApiService.js'
import {
  requestCoachChatReply,
  requestCoachRealtimeSession,
} from './aiChatController.js'

vi.mock('../aiApiService.js', () => ({
  requestAiEndpoint: vi.fn(),
}))

describe('aiChatController', () => {
  beforeEach(() => {
    requestAiEndpoint.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('answers a new coach question through the coach domain and not /api/ai', async () => {
    const fallbackReply = vi.fn(async () => 'gammal motor')
    const result = await requestCoachChatReply({
      appData: { today: '2026-09-30' },
      chatHistory: [],
      fallbackReply,
      message: 'Hur fungerar vikttrend?',
    })

    expect(requestAiEndpoint).not.toHaveBeenCalled()
    expect(fallbackReply).not.toHaveBeenCalled()
    expect(result.source).toBe('local')
    expect(result.reply).toMatch(/flera veckor/)
    expect(result.tool).toBeNull()
    expect(result.handoff).toBe(false)
  })

  it('does not start a realtime session through /api/ai', async () => {
    const result = await requestCoachRealtimeSession({
      appData: { profile: { name: 'Hassan' } },
      chatHistory: [],
    })

    expect(requestAiEndpoint).not.toHaveBeenCalled()
    expect(result.available).toBe(false)
    expect(result.clientSecret).toBeUndefined()
    expect(result.message).toMatch(/avstängt/i)
  })
})
