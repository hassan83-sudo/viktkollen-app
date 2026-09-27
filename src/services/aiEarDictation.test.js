import { describe, expect, it, vi } from 'vitest'

import {
  aiEarDictationErrors,
  createAiEarDictation,
  isAiEarDictationSupported,
  mapAiEarDictationError,
} from './aiEarDictation.js'

// AI-EAR-2C: Tal → text with the browser's own SpeechRecognition. No server,
// no provider, no audio file.

function fakeSpeechScope({ key = 'SpeechRecognition', throwOnStart = false } = {}) {
  const instances = []
  class FakeRecognition {
    constructor() {
      this.start = vi.fn(() => { if (throwOnStart) throw new Error('InvalidStateError') })
      this.stop = vi.fn()
      this.abort = vi.fn()
      instances.push(this)
    }
  }
  return { instances, Recognition: FakeRecognition, scope: { [key]: FakeRecognition } }
}

function speechResult(segments, resultIndex = 0) {
  const results = segments.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal }))
  return { resultIndex, results }
}

function setup(options = {}) {
  const fake = fakeSpeechScope(options)
  const callbacks = { onEnd: vi.fn(), onError: vi.fn(), onFinal: vi.fn(), onInterim: vi.fn(), onStart: vi.fn() }
  const dictation = createAiEarDictation({
    getLanguage: () => options.language ?? 'sv',
    getScope: () => fake.scope,
    isSecureContext: () => options.secure ?? true,
    hostname: () => options.hostname ?? 'viktkollen.se',
    ...callbacks,
  })
  return { ...fake, ...callbacks, dictation }
}

describe('aiEarDictation (AI-EAR-2C)', () => {
  it('uses SpeechRecognition when available, with continuous interim results', () => {
    const { dictation, instances } = setup()
    expect(dictation.start()).toBe(true)
    expect(instances).toHaveLength(1)
    const [recognition] = instances
    expect(recognition.start).toHaveBeenCalledTimes(1)
    expect(recognition.continuous).toBe(true)
    expect(recognition.interimResults).toBe(true)
    expect(recognition.maxAlternatives).toBe(1)
    expect(dictation.isActive()).toBe(true)
  })

  it('falls back to webkitSpeechRecognition', () => {
    const { dictation, instances, scope } = setup({ key: 'webkitSpeechRecognition' })
    expect(isAiEarDictationSupported(scope)).toBe(true)
    expect(dictation.start()).toBe(true)
    expect(instances).toHaveLength(1)
  })

  it('an unsupported browser is detected and reports "unsupported" without throwing', () => {
    expect(isAiEarDictationSupported({})).toBe(false)
    const onError = vi.fn()
    const dictation = createAiEarDictation({ getScope: () => ({}), onError })
    expect(() => dictation.start()).not.toThrow()
    expect(onError).toHaveBeenCalledWith('unsupported')
    expect(dictation.isActive()).toBe(false)
  })

  it('an insecure page reports "insecure"; localhost is allowed', () => {
    let hook = setup({ secure: false })
    expect(hook.dictation.start()).toBe(false)
    expect(hook.onError).toHaveBeenCalledWith('insecure')
    expect(hook.instances).toHaveLength(0)
    hook = setup({ secure: false, hostname: 'localhost' })
    expect(hook.dictation.start()).toBe(true)
  })

  it.each([['sv', 'sv-SE'], ['en', 'en-US'], ['da', 'da-DK'], ['xx', 'sv-SE']])('language %s → %s', (language, locale) => {
    const { dictation, instances } = setup({ language })
    dictation.start()
    expect(instances[0].lang).toBe(locale)
  })

  it('start → onStart; interim and final results are delivered separately', () => {
    const { dictation, instances, onFinal, onInterim, onStart } = setup()
    dictation.start()
    const [recognition] = instances
    recognition.onstart()
    expect(onStart).toHaveBeenCalledTimes(1)
    recognition.onresult(speechResult([['hej', false]]))
    expect(onInterim).toHaveBeenLastCalledWith('hej')
    expect(onFinal).not.toHaveBeenCalled()
    recognition.onresult(speechResult([['hej där', true], ['hur', false], ['mår du', false]]))
    expect(onFinal).toHaveBeenCalledWith('hej där')
    expect(onInterim).toHaveBeenLastCalledWith('hur mår du')
    // Only results from resultIndex are new.
    recognition.onresult(speechResult([['hej där', true], ['hur mår du', true]], 1))
    expect(onFinal).toHaveBeenCalledTimes(2)
    expect(onFinal).toHaveBeenLastCalledWith('hur mår du')
    expect(onInterim).toHaveBeenLastCalledWith('')
  })

  it('stop → recognition.stop, then end → onEnd; the requested stop is not an error', () => {
    const { dictation, instances, onEnd, onError, onInterim } = setup()
    dictation.start()
    const [recognition] = instances
    dictation.stop()
    expect(recognition.stop).toHaveBeenCalledTimes(1)
    recognition.onerror({ error: 'aborted' })
    recognition.onend()
    expect(onError).not.toHaveBeenCalled()
    expect(onInterim).toHaveBeenLastCalledWith('')
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(dictation.isActive()).toBe(false)
    // A new session can start after the first.
    expect(dictation.start()).toBe(true)
    expect(instances).toHaveLength(2)
  })

  it('abort ends at once, detaches the handlers and runs no further callbacks', () => {
    const { dictation, instances, onEnd, onError, onFinal } = setup()
    dictation.start()
    const [recognition] = instances
    dictation.abort()
    expect(recognition.abort).toHaveBeenCalledTimes(1)
    expect(recognition.onresult).toBeNull()
    expect(recognition.onend).toBeNull()
    expect(dictation.isActive()).toBe(false)
    expect(onEnd).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(onFinal).not.toHaveBeenCalled()
  })

  it.each([
    ['not-allowed', 'mic_denied'],
    ['service-not-allowed', 'mic_denied'],
    ['no-speech', 'no_speech'],
    ['audio-capture', 'audio_capture'],
    ['aborted', 'aborted'],
    ['network', 'recognition_error'],
    ['something-new', 'recognition_error'],
  ])('browser error %s → %s, and no onEnd after the error', (error, code) => {
    expect(mapAiEarDictationError(error)).toBe(code)
    expect(aiEarDictationErrors).toContain(code)
    const { dictation, instances, onEnd, onError } = setup()
    dictation.start()
    instances[0].onerror({ error, message: 'raw browser text' })
    instances[0].onend()
    expect(onError).toHaveBeenCalledWith(code)
    expect(onError).not.toHaveBeenCalledWith(expect.stringContaining('raw'))
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('a throwing recognition.start → recognition_error, not active', () => {
    const { dictation, onError } = setup({ throwOnStart: true })
    expect(dictation.start()).toBe(false)
    expect(onError).toHaveBeenCalledWith('recognition_error')
    expect(dictation.isActive()).toBe(false)
  })

  it('double start runs one recognition; dispose aborts and blocks later starts', () => {
    const { dictation, instances } = setup()
    dictation.start()
    expect(dictation.start()).toBe(false)
    expect(instances).toHaveLength(1)
    dictation.dispose()
    expect(instances[0].abort).toHaveBeenCalled()
    expect(dictation.start()).toBe(false)
    expect(instances).toHaveLength(1)
  })

  it('stop and abort while idle do nothing', () => {
    const { dictation } = setup()
    expect(() => { dictation.stop(); dictation.abort() }).not.toThrow()
  })

  it('never touches MediaRecorder, getUserMedia, fetch or storage', async () => {
    const { readFileSync } = await import('node:fs')
    // Code only: the doc comment names MediaRecorder to explain the split.
    const text = readFileSync(new URL('./aiEarDictation.js', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    for (const banned of ['MediaRecorder', 'getUserMedia', 'fetch(', 'localStorage', 'sessionStorage', '/api/', 'openai']) {
      expect(text.toLowerCase()).not.toContain(banned.toLowerCase())
    }
  })
})
