import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createVoiceConversationController,
  getSpeechRecognitionConstructor,
} from './voiceConversationController.js'

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function createRecognitionClass() {
  const instances = []

  class FakeRecognition {
    constructor() {
      this.handlers = {}
      this.abort = vi.fn(() => this.emit('end'))
      this.start = vi.fn(() => this.emit('start'))
      this.stop = vi.fn(() => this.emit('end'))
      instances.push(this)
    }

    addEventListener(type, handler) {
      this.handlers[type] = handler
    }

    emit(type, event = {}) {
      this.handlers[type]?.(event)
    }

    emitResult(text) {
      this.emit('result', {
        results: [[{ transcript: text }]],
      })
    }
  }

  FakeRecognition.instances = instances
  return FakeRecognition
}

function makeController(overrides = {}) {
  const status = []
  const listening = []
  const active = []
  const Recognition = overrides.Recognition || createRecognitionClass()
  const mediaDevices = overrides.mediaDevices || {
    getUserMedia: vi.fn(async () => ({
      getTracks: () => [{ stop: vi.fn() }],
    })),
  }
  const onTranscript = overrides.onTranscript || vi.fn(async () => {})
  const controller = createVoiceConversationController({
    getMediaDevices: () => mediaDevices,
    getScope: () => overrides.scope || { SpeechRecognition: Recognition },
    hostname: () => overrides.hostname || 'localhost',
    isSecureContext: () => overrides.secureContext ?? true,
    onTranscript,
    setActive: (value) => active.push(value),
    setListening: (value) => listening.push(value),
    setStatus: (value) => status.push(value),
    silenceTimeoutMs: overrides.silenceTimeoutMs,
  })

  return {
    active,
    controller,
    listening,
    mediaDevices,
    onTranscript,
    Recognition,
    status,
  }
}

describe('voiceConversationController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('starts a conversation and listens once after one microphone press', async () => {
    const { active, controller, listening, Recognition, status } = makeController()

    await controller.start()

    expect(active).toEqual([true])
    expect(listening).toContain(true)
    expect(status).toContain('Lyssnar...')
    expect(Recognition.instances[0].lang).toBe('sv-SE')
    expect(Recognition.instances[0].continuous).toBe(false)
  })

  it('continues listening automatically after AI response completes', async () => {
    const response = deferred()
    const { controller, onTranscript, Recognition, status } = makeController({
      onTranscript: vi.fn(() => response.promise),
    })

    await controller.start()
    Recognition.instances[0].emitResult('Hur ligger jag till?')
    await vi.advanceTimersByTimeAsync(130)

    expect(onTranscript).toHaveBeenCalledWith('Hur ligger jag till?')
    expect(status).toContain('Bearbetar...')
    expect(status).toContain('AI svarar...')

    response.resolve()
    await vi.advanceTimersByTimeAsync(260)

    expect(Recognition.instances).toHaveLength(2)
    expect(status.at(-1)).toBe('Lyssnar...')
  })

  it('announces silence after 15 seconds and restarts listening', async () => {
    const { controller, Recognition, status } = makeController()

    await controller.start()
    await vi.advanceTimersByTimeAsync(15000)
    await vi.advanceTimersByTimeAsync(360)

    expect(status).toContain('Jag hör inget. Vill du fortsätta?')
    expect(Recognition.instances).toHaveLength(2)
  })

  it('shows microphone permission denied and does not lock the UI', async () => {
    const { active, controller, listening, status } = makeController({
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          const error = new Error('denied')
          error.name = 'NotAllowedError'
          throw error
        }),
      },
    })

    await controller.start()

    expect(active).toEqual([true, false])
    expect(listening).not.toContain(true)
    expect(status.at(-1)).toMatch(/Mikrofonbehörighet nekades/)
  })

  it('falls back clearly when SpeechRecognition is unsupported', async () => {
    const { active, controller, status } = makeController({ scope: {} })

    await controller.start()

    expect(active).toEqual([true, false])
    expect(status.at(-1)).toMatch(/Röstinmatning stöds inte/)
  })

  it('recovers from recognition errors by restarting automatically', async () => {
    const { controller, Recognition, status } = makeController()

    await controller.start()
    Recognition.instances[0].emit('error', { error: 'network' })
    await vi.advanceTimersByTimeAsync(510)

    expect(status).toContain('Röstinmatningen startas om automatiskt.')
    expect(Recognition.instances).toHaveLength(2)
  })

  it('stops the conversation without restarting', async () => {
    const { active, controller, Recognition, status } = makeController()

    await controller.start()
    controller.stop()
    await vi.advanceTimersByTimeAsync(16000)

    expect(active).toEqual([true, false])
    expect(status.at(-1)).toBe('Samtalet avslutades.')
    expect(Recognition.instances).toHaveLength(1)
  })

  it('uses webkitSpeechRecognition for iOS Safari/PWA', () => {
    const WebkitRecognition = createRecognitionClass()

    expect(getSpeechRecognitionConstructor({ webkitSpeechRecognition: WebkitRecognition })).toBe(WebkitRecognition)
  })
})
