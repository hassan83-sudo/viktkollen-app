import { describe, expect, it, vi } from 'vitest'
import {
  createRealtimeVoiceController,
  getVoicePhaseLabel,
  mapRealtimeEventToPhase,
  VOICE_PERMISSION_DENIED_MESSAGE,
  VOICE_UNAVAILABLE_MESSAGE,
} from './realtimeVoiceController.js'

function createTimers() {
  const callbacks = []
  return {
    callbacks,
    clearTimeout: vi.fn(),
    setTimeout: vi.fn((callback) => {
      callbacks.push(callback)
      return callbacks.length
    }),
  }
}

describe('realtimeVoiceController', () => {
  it('labels idle, listening, thinking and speaking states', () => {
    expect(getVoicePhaseLabel({})).toBe('Tryck för att prata')
    expect(getVoicePhaseLabel({ isVoiceConversationActive: true })).toBe('Redo')
    expect(getVoicePhaseLabel({ isListening: true })).toBe('Lyssnar...')
    expect(getVoicePhaseLabel({ isAiSpeaking: true })).toBe('AI pratar...')
    expect(mapRealtimeEventToPhase({ type: 'response.created' })).toBe('thinking')
  })

  it('starts a session with one tap after minting an ephemeral client secret', async () => {
    const mediaStream = { getAudioTracks: () => [{ enabled: true }], getTracks: () => [{ stop: vi.fn() }] }
    const peer = { close: vi.fn() }
    const controller = createRealtimeVoiceController({
      connectRealtime: vi.fn(async () => peer),
      getUserMedia: vi.fn(async () => mediaStream),
      onStatus: vi.fn(),
      requestSession: vi.fn(async () => ({
        available: true,
        clientSecret: 'ek_test',
        idleTimeoutMs: 45000,
        maxSessionMs: 180000,
        model: 'gpt-4o-mini-realtime-preview',
      })),
      setActive: vi.fn(),
      setListening: vi.fn(),
      setSpeaking: vi.fn(),
      timers: createTimers(),
    })

    const result = await controller.start()

    expect(result).toEqual({ ok: true })
    expect(controller.isActive()).toBe(true)
    controller.stop()
    expect(peer.close).toHaveBeenCalled()
  })

  it('handles microphone permission denial without crashing', async () => {
    const onStatus = vi.fn()
    const controller = createRealtimeVoiceController({
      connectRealtime: vi.fn(),
      getUserMedia: vi.fn(async () => {
        const error = new Error('denied')
        error.name = 'NotAllowedError'
        throw error
      }),
      onStatus,
      requestSession: vi.fn(async () => ({ available: true, clientSecret: 'ek_test' })),
      setActive: vi.fn(),
      timers: createTimers(),
    })

    const result = await controller.start()

    expect(result).toEqual({ ok: false, reason: 'denied' })
    expect(onStatus).toHaveBeenCalledWith(VOICE_PERMISSION_DENIED_MESSAGE)
  })

  it('handles session failure without exposing secrets', async () => {
    const onStatus = vi.fn()
    const controller = createRealtimeVoiceController({
      connectRealtime: vi.fn(),
      getUserMedia: vi.fn(),
      onStatus,
      requestSession: vi.fn(async () => ({
        available: false,
        message: VOICE_UNAVAILABLE_MESSAGE,
      })),
      setActive: vi.fn(),
      timers: createTimers(),
    })

    const result = await controller.start()

    expect(result).toEqual({ ok: false, reason: 'unavailable' })
    expect(onStatus).toHaveBeenCalledWith(VOICE_UNAVAILABLE_MESSAGE)
    expect(JSON.stringify(result)).not.toMatch(/OPENAI_API_KEY|sk-/)
  })

  it('cleans up the session on stop and avoids a second concurrent session', async () => {
    const firstPeer = { close: vi.fn() }
    const secondPeer = { close: vi.fn() }
    const mediaStream = { getAudioTracks: () => [{ enabled: true }], getTracks: () => [{ stop: vi.fn() }] }
    const first = createRealtimeVoiceController({
      connectRealtime: vi.fn(async () => firstPeer),
      getUserMedia: vi.fn(async () => mediaStream),
      requestSession: vi.fn(async () => ({ available: true, clientSecret: 'ek_one' })),
      setActive: vi.fn(),
      timers: createTimers(),
    })
    const second = createRealtimeVoiceController({
      connectRealtime: vi.fn(async () => secondPeer),
      getUserMedia: vi.fn(async () => mediaStream),
      requestSession: vi.fn(async () => ({ available: true, clientSecret: 'ek_two' })),
      setActive: vi.fn(),
      timers: createTimers(),
    })

    await first.start()
    await second.start()

    expect(firstPeer.close).toHaveBeenCalled()
    expect(second.isActive()).toBe(true)
    second.stop()
    expect(second.isActive()).toBe(false)
  })
})
