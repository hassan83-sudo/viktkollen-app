import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { requestAiEndpoint } from '../aiApiService.js'
import {
  buildCoachChatRemotePayload,
  requestCoachChatReply,
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

  it('sends a chat payload with the user message and compact health facts', () => {
    const payload = buildCoachChatRemotePayload(
      {
        checkIn: { steps: 7200 },
        healthSnapshot: { weight: { current: 83.8 } },
        nutritionGoals: { protein: 145 },
        profile: { name: 'Hassan', weightDirection: 'loss' },
        weights: [{ date: '2026-08-21', value: 83.8 }],
      },
      'Hur mycket protein behöver jag?',
      [{ role: 'user', text: 'Hej' }],
    )

    expect(payload).toMatchObject({
      action: 'chat',
      currentWeight: 83.8,
      message: 'Hur mycket protein behöver jag?',
    })
    expect(payload.profile.name).toBe('Hassan')
    expect(payload.nutritionGoals.protein).toBe(145)
  })

  it('uses the remote OpenAI chat reply when /api/ai succeeds', async () => {
    requestAiEndpoint.mockResolvedValue({
      data: { reply: 'Du ligger på 83,8 kg. Sikta på kyckling, nötkött eller ägg till middag.' },
      ok: true,
      source: 'openai',
    })

    const result = await requestCoachChatReply({
      appData: { profile: { name: 'Hassan' } },
      chatHistory: [],
      fallbackReply: async () => 'fallback',
      message: 'Hej',
    })

    expect(requestAiEndpoint).toHaveBeenCalled()
    expect(result).toEqual({
      reply: 'Du ligger på 83,8 kg. Sikta på kyckling, nötkött eller ägg till middag.',
      source: 'openai',
    })
  })
})
