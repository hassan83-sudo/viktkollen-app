import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createVoiceConversationController,
  getSpeechRecognitionConstructor,
  selectSpeechSynthesisVoice,
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

function createSpeechSynthesis({ voices = [], throwOnSpeak = false } = {}) {
  const handlers = {}
  let voiceList = voices
  return {
    addEventListener: vi.fn((type, handler) => {
      handlers[type] = handler
    }),
    cancel: vi.fn(),
    getVoices: vi.fn(() => voiceList),
    removeEventListener: vi.fn((type) => {
      delete handlers[type]
    }),
    speak: vi.fn((utterance) => {
      if (throwOnSpeak) throw new Error('speech failed')
      createSpeechSynthesis.lastUtterance = utterance
    }),
    triggerVoicesChanged(nextVoices) {
      voiceList = nextVoices
      handlers.voiceschanged?.()
    },
  }
}

function FakeSpeechSynthesisUtterance(text) {
  this.text = text
  this.lang = ''
  this.pitch = 1
  this.rate = 1
  this.voice = null
  this.onerror = null
  this.onend = null
}

function makeController(overrides = {}) {
  const status = []
  const listening = []
  const speaking = []
  const active = []
  const Recognition = overrides.Recognition || createRecognitionClass()
  const mediaDevices = overrides.mediaDevices || {
    getUserMedia: vi.fn(async () => ({
      getTracks: () => [{ stop: vi.fn() }],
    })),
  }
  const onTranscript = overrides.onTranscript || vi.fn(async () => 'Svar från AI.')
  const speechSynthesis = Object.hasOwn(overrides, 'speechSynthesis')
    ? overrides.speechSynthesis
    : createSpeechSynthesis()
  const SpeechSynthesisUtterance = Object.hasOwn(overrides, 'SpeechSynthesisUtterance')
    ? overrides.SpeechSynthesisUtterance
    : FakeSpeechSynthesisUtterance
  const controller = createVoiceConversationController({
    getMediaDevices: () => mediaDevices,
    getScope: () => overrides.scope || { SpeechRecognition: Recognition },
    getSpeechSynthesis: () => speechSynthesis,
    getSpeechSynthesisUtterance: () => SpeechSynthesisUtterance,
    hostname: () => overrides.hostname || 'localhost',
    isSecureContext: () => overrides.secureContext ?? true,
    isSpeechEnabled: () => overrides.speechEnabled ?? true,
    onTranscript,
    setActive: (value) => active.push(value),
    setListening: (value) => listening.push(value),
    setSpeaking: (value) => speaking.push(value),
    setStatus: (value) => status.push(value),
    silenceTimeoutMs: overrides.silenceTimeoutMs,
    speechRecoveryMs: overrides.speechRecoveryMs,
  })

  return {
    active,
    controller,
    listening,
    mediaDevices,
    onTranscript,
    Recognition,
    speaking,
    speechSynthesis,
    status,
  }
}

describe('voiceConversationController', () => {
  beforeEach(() => {
    createSpeechSynthesis.lastUtterance = null
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
    expect(status).toContain('🎤 Lyssnar...')
    expect(Recognition.instances[0].lang).toBe('sv-SE')
    expect(Recognition.instances[0].continuous).toBe(false)
  })

  it('continues listening automatically after AI speech ends', async () => {
    const response = deferred()
    const { controller, onTranscript, Recognition, speechSynthesis, status } = makeController({
      onTranscript: vi.fn(() => response.promise),
    })

    await controller.start()
    Recognition.instances[0].emitResult('Hur ligger jag till?')
    await vi.advanceTimersByTimeAsync(130)

    expect(onTranscript).toHaveBeenCalledWith('Hur ligger jag till?')
    expect(status).toContain('🧠 Bearbetar...')
    expect(status).toContain('🧠 AI svarar...')

    response.resolve('Du ligger bra till.')
    await vi.advanceTimersByTimeAsync(1)

    expect(speechSynthesis.speak).toHaveBeenCalledTimes(1)
    expect(Recognition.instances).toHaveLength(1)

    createSpeechSynthesis.lastUtterance.onend()
    await vi.advanceTimersByTimeAsync(510)

    expect(Recognition.instances).toHaveLength(2)
    expect(status.at(-1)).toBe('🎤 Lyssnar...')
  })

  it('selects a Swedish speech synthesis voice when available', async () => {
    const swedishVoice = { default: false, lang: 'sv-SE', name: 'Svenska' }
    const fallbackVoice = { default: true, lang: 'en-US', name: 'English' }
    const speechSynthesis = createSpeechSynthesis({ voices: [fallbackVoice, swedishVoice] })
    const { controller, Recognition } = makeController({ speechSynthesis })

    await controller.start()
    Recognition.instances[0].emitResult('Hej')
    await vi.advanceTimersByTimeAsync(100)

    expect(selectSpeechSynthesisVoice([fallbackVoice, swedishVoice])).toBe(swedishVoice)
    expect(createSpeechSynthesis.lastUtterance.voice).toBe(swedishVoice)
    expect(createSpeechSynthesis.lastUtterance.lang).toBe('sv-SE')
  })

  it('uses browser fallback voice when no voices are loaded yet', async () => {
    const { controller, Recognition, speechSynthesis } = makeController()

    await controller.start()
    Recognition.instances[0].emitResult('Hej')
    await vi.advanceTimersByTimeAsync(100)

    expect(speechSynthesis.getVoices).toHaveBeenCalled()
    expect(createSpeechSynthesis.lastUtterance.voice).toBe(null)
    expect(createSpeechSynthesis.lastUtterance.lang).toBe('sv-SE')
  })

  it('handles voiceschanged when voices load after speech starts', async () => {
    const speechSynthesis = createSpeechSynthesis()
    const { controller, Recognition } = makeController({ speechSynthesis })
    const swedishVoice = { lang: 'sv-SE', name: 'Svenska' }

    await controller.start()
    Recognition.instances[0].emitResult('Hej')
    await vi.advanceTimersByTimeAsync(100)
    speechSynthesis.triggerVoicesChanged([swedishVoice])

    expect(createSpeechSynthesis.lastUtterance.voice).toBe(swedishVoice)
    expect(createSpeechSynthesis.lastUtterance.lang).toBe('sv-SE')
  })

  it('announces silence after 15 seconds and restarts listening', async () => {
    const { controller, Recognition, status } = makeController()

    await controller.start()
    await vi.advanceTimersByTimeAsync(15000)
    await vi.advanceTimersByTimeAsync(460)

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
    await vi.advanceTimersByTimeAsync(610)

    expect(status).toContain('Röstinmatningen startas om automatiskt.')
    expect(Recognition.instances).toHaveLength(2)
  })

  it('stops the conversation and cancels speech without restarting', async () => {
    const { active, controller, Recognition, speechSynthesis, status } = makeController()

    await controller.start()
    Recognition.instances[0].emitResult('Protein?')
    await vi.advanceTimersByTimeAsync(100)
    controller.stop()
    await vi.advanceTimersByTimeAsync(31000)

    expect(active).toEqual([true, false])
    expect(status.at(-1)).toBe('')
    expect(Recognition.instances).toHaveLength(1)
    expect(speechSynthesis.cancel).toHaveBeenCalled()
  })

  it('lets the user interrupt AI speech and resumes listening', async () => {
    const { controller, Recognition, speechSynthesis, status } = makeController()

    await controller.start()
    Recognition.instances[0].emitResult('Berätta mer')
    await vi.advanceTimersByTimeAsync(100)

    expect(controller.stopSpeakingAndResume()).toBe(true)
    await vi.advanceTimersByTimeAsync(130)

    expect(speechSynthesis.cancel).toHaveBeenCalled()
    expect(status.at(-1)).toBe('🎤 Lyssnar...')
    expect(Recognition.instances).toHaveLength(2)
  })

  it('continues without speech synthesis when unsupported', async () => {
    const { controller, Recognition, status } = makeController({
      SpeechSynthesisUtterance: null,
      speechSynthesis: null,
    })

    await controller.start()
    Recognition.instances[0].emitResult('Hej')
    await vi.advanceTimersByTimeAsync(700)

    expect(status).toContain('🧠 AI svarar...')
    expect(Recognition.instances).toHaveLength(2)
  })

  it('recovers if speech synthesis errors or never reports onend', async () => {
    const { controller, Recognition, status } = makeController({ speechRecoveryMs: 1200 })

    await controller.start()
    Recognition.instances[0].emitResult('Hej')
    await vi.advanceTimersByTimeAsync(100)

    createSpeechSynthesis.lastUtterance.onerror()
    await vi.advanceTimersByTimeAsync(510)
    expect(Recognition.instances).toHaveLength(2)

    Recognition.instances[1].emitResult('Nästa fråga')
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(1800)

    expect(status).toContain('🔊 AI pratar...')
    expect(Recognition.instances).toHaveLength(3)
  })

  it('does not restart recognition while AI speech is active', async () => {
    const { controller, Recognition } = makeController()

    await controller.start()
    Recognition.instances[0].emitResult('Hej')
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(1000)

    expect(Recognition.instances).toHaveLength(1)

    createSpeechSynthesis.lastUtterance.onend()
    await vi.advanceTimersByTimeAsync(510)

    expect(Recognition.instances).toHaveLength(2)
  })

  it('skips AI speech when the voice preference is off', async () => {
    const { controller, Recognition, speechSynthesis } = makeController({ speechEnabled: false })

    await controller.start()
    Recognition.instances[0].emitResult('Hej')
    await vi.advanceTimersByTimeAsync(600)

    expect(speechSynthesis.speak).not.toHaveBeenCalled()
    expect(Recognition.instances).toHaveLength(2)
  })

  it('uses webkitSpeechRecognition for iOS Safari/PWA', () => {
    const WebkitRecognition = createRecognitionClass()

    expect(getSpeechRecognitionConstructor({ webkitSpeechRecognition: WebkitRecognition })).toBe(WebkitRecognition)
  })
})
