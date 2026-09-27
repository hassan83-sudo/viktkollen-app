/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '../../i18n/index.js'
import { createAiEarDictation } from '../../services/aiEarDictation.js'
import AiEarMode from './AiEarMode.jsx'

// AI-EAR-2C: Tal → text in AI Örat, driven through the real dictation
// controller with a fake browser SpeechRecognition.

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function fakeSpeech(key = 'SpeechRecognition') {
  const instances = []
  class FakeRecognition {
    constructor() {
      this.start = vi.fn()
      this.stop = vi.fn(() => this.onend?.())
      this.abort = vi.fn()
      instances.push(this)
    }
  }
  return { instances, scope: { [key]: FakeRecognition } }
}

function result(segments, resultIndex = 0) {
  return { resultIndex, results: segments.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })) }
}

function setup({ key, supported = true, writeClipboard = vi.fn(async () => {}) } = {}) {
  const speech = fakeSpeech(key)
  const recorders = []
  class FakeMediaRecorder {
    constructor() { recorders.push(this); this.state = 'inactive' }
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive'; this.onstop?.() }
  }
  const deps = {
    blobToWav: vi.fn(),
    getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })),
    interpret: vi.fn(),
    MediaRecorderImpl: FakeMediaRecorder,
    dictation: {
      createDictation: (callbacks) => createAiEarDictation({
        ...callbacks,
        getLanguage: () => i18n.language,
        getScope: () => speech.scope,
        isSecureContext: () => true,
      }),
      isSupported: () => supported,
      writeClipboard,
    },
  }
  const view = render(<AiEarMode deps={deps} />)
  return { ...view, deps, recorders, speech, writeClipboard }
}

const speechRadio = () => screen.getByRole('radio', { name: /^Tal → text/ })
const panel = () => document.querySelector('.ai-ear-dictation')

function openSpeech() {
  fireEvent.click(speechRadio())
}

function startListening(speech) {
  fireEvent.click(screen.getByRole('button', { name: 'Starta lyssning' }))
  const recognition = speech.instances.at(-1)
  act(() => recognition.onstart())
  return recognition
}

describe('AI Örat Tal → text (AI-EAR-2C)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sv')
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } })
  })
  afterEach(() => cleanup())

  it('shows Starta lyssning, the privacy note and an empty transcript; no record or file controls', () => {
    setup()
    openSpeech()
    const start = screen.getByRole('button', { name: 'Starta lyssning' })
    expect(start.getAttribute('aria-describedby')).toBe('ai-ear-dictation-privacy')
    expect(screen.getByText(/Viktkollen tar inte emot ljudet/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Transkription' })).toBeTruthy()
    expect(screen.getByText('Ingen text ännu.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Spela in' })).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('SpeechRecognition: start → "Lyssnar…" once in one status region, the button becomes Stoppa, Swedish locale', () => {
    const { speech } = setup()
    openSpeech()
    const recognition = startListening(speech)
    expect(recognition.start).toHaveBeenCalledTimes(1)
    expect(recognition.lang).toBe('sv-SE')
    const statuses = within(panel()).getAllByRole('status')
    expect(statuses).toHaveLength(1)
    expect(statuses[0].textContent).toMatch(/^Lyssnar…$/)
    expect(screen.getByRole('button', { name: 'Stoppa lyssning' })).toBeTruthy()
  })

  it('webkitSpeechRecognition fallback works the same way', () => {
    const { speech } = setup({ key: 'webkitSpeechRecognition' })
    openSpeech()
    startListening(speech)
    expect(speech.instances).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Stoppa lyssning' })).toBeTruthy()
  })

  it('English UI → en-US recognition', async () => {
    await i18n.changeLanguage('en')
    const { speech } = setup()
    fireEvent.click(screen.getByRole('radio', { name: /^Speech → text/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start listening' }))
    expect(speech.instances[0].lang).toBe('en-US')
  })

  it('an unsupported browser shows a localized message and does not crash', () => {
    const { speech } = setup({ supported: false })
    openSpeech()
    expect(screen.getByRole('heading', { name: 'Tal → text stöds inte i den här webbläsaren' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Starta lyssning' })).toBeNull()
    expect(speech.instances).toHaveLength(0)
  })

  it('interim text is shown outside the live region; final text goes to the transcript; focus stays put', () => {
    const { speech } = setup()
    openSpeech()
    const recognition = startListening(speech)
    const toggle = screen.getByRole('button', { name: 'Stoppa lyssning' })
    toggle.focus()
    const status = within(panel()).getByRole('status')

    act(() => recognition.onresult(result([['hej', false]])))
    const interim = document.querySelector('.ai-ear-interim')
    expect(interim.textContent).toContain('hej')
    expect(status.contains(interim)).toBe(false)
    expect(interim.closest('[aria-live], [role="status"], [role="alert"]')).toBeNull()
    expect(status.textContent).toMatch(/^Lyssnar…$/)

    act(() => recognition.onresult(result([['hej där', true]])))
    act(() => recognition.onresult(result([['hej där', true], ['hur mår du', true]], 1)))
    expect(document.querySelector('.ai-ear-transcript-text').textContent).toMatch(/^hej där hur mår du$/)
    expect(status.contains(document.querySelector('.ai-ear-transcript-text'))).toBe(false)
    expect(document.activeElement).toBe(toggle)
  })

  it('Stoppa ends the session: "Klart", the button is Starta again with focus kept, interim cleared', () => {
    const { speech } = setup()
    openSpeech()
    const recognition = startListening(speech)
    act(() => recognition.onresult(result([['en mening', true], ['mer', false]])))
    const toggle = screen.getByRole('button', { name: 'Stoppa lyssning' })
    toggle.focus()
    fireEvent.click(toggle)
    expect(recognition.stop).toHaveBeenCalledTimes(1)
    expect(within(panel()).getByRole('status').textContent).toContain('Klart. Texten finns under Transkription.')
    expect(screen.getByRole('button', { name: 'Starta lyssning' })).toBe(toggle)
    expect(document.activeElement).toBe(toggle)
    expect(document.querySelector('.ai-ear-interim')).toBeNull()
    expect(screen.getByText('en mening')).toBeTruthy()
  })

  it('a session that ends without text announces nothing', () => {
    const { speech } = setup()
    openSpeech()
    const recognition = startListening(speech)
    fireEvent.click(screen.getByRole('button', { name: 'Stoppa lyssning' }))
    expect(recognition.stop).toHaveBeenCalled()
    expect(within(panel()).getByRole('status').textContent).toMatch(/^$/)
  })

  it.each([
    ['not-allowed', 'Mikrofonen är inte tillåten'],
    ['no-speech', 'Inget tal hördes'],
    ['audio-capture', 'Ingen mikrofon hittades'],
    ['aborted', 'Lyssningen avbröts'],
    ['network', 'Taligenkänningen fungerade inte'],
  ])('browser error %s → alert "%s" with Försök igen that starts a new session', (error, title) => {
    const { speech } = setup()
    openSpeech()
    const recognition = startListening(speech)
    act(() => {
      recognition.onerror({ error, message: 'raw browser message' })
      recognition.onend()
    })
    const alert = screen.getByRole('alert')
    expect(within(alert).getByRole('heading', { name: title })).toBeTruthy()
    expect(alert.textContent).not.toContain('raw browser message')
    expect(screen.getByRole('button', { name: 'Starta lyssning' })).toBeTruthy()
    expect(within(panel()).getByRole('status').textContent).toMatch(/^$/)

    fireEvent.click(within(alert).getByRole('button', { name: 'Försök igen' }))
    expect(speech.instances).toHaveLength(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('Kopiera writes the transcript and announces "Kopierat"; a failure is announced too', async () => {
    const writeClipboard = vi.fn(async () => {})
    const { speech } = setup({ writeClipboard })
    openSpeech()
    const recognition = startListening(speech)
    act(() => recognition.onresult(result([['kopiera mig', true]])))
    fireEvent.click(screen.getByRole('button', { name: 'Stoppa lyssning' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Kopiera texten' })))
    expect(writeClipboard).toHaveBeenCalledWith('kopiera mig')
    expect(within(panel()).getByRole('status').textContent).toMatch(/^Kopierat$/)

    writeClipboard.mockRejectedValueOnce(new Error('denied'))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Kopiera texten' })))
    expect(within(panel()).getByRole('status').textContent).toContain('Texten kunde inte kopieras.')
  })

  it('Rensa empties the transcript, announces it and moves focus back to the start button', () => {
    const { speech } = setup()
    openSpeech()
    const recognition = startListening(speech)
    act(() => recognition.onresult(result([['rensa mig', true]])))
    fireEvent.click(screen.getByRole('button', { name: 'Stoppa lyssning' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rensa texten' }))
    expect(screen.queryByText('rensa mig')).toBeNull()
    expect(screen.getByText('Ingen text ännu.')).toBeTruthy()
    expect(within(panel()).getByRole('status').textContent).toContain('Texten är rensad.')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Starta lyssning' }))
    expect(screen.queryByRole('button', { name: 'Kopiera texten' })).toBeNull()
  })

  it('changing mode while listening aborts the recognition; late events do nothing', () => {
    const { speech } = setup()
    openSpeech()
    const recognition = startListening(speech)
    const onresult = recognition.onresult
    fireEvent.click(screen.getByRole('radio', { name: /^Ljudigenkänning/ }))
    expect(recognition.abort).toHaveBeenCalledTimes(1)
    expect(recognition.onresult).toBeNull()
    expect(recognition.onend).toBeNull()
    expect(() => act(() => onresult(result([['sent', true]])))).not.toThrow()
    expect(screen.queryByText('sent')).toBeNull()
    expect(panel()).toBeNull()
    expect(screen.getByRole('button', { name: 'Spela in' })).toBeTruthy()
  })

  it('unmounting AI Örat while listening aborts the recognition', () => {
    const { speech, unmount } = setup()
    openSpeech()
    const recognition = startListening(speech)
    unmount()
    expect(recognition.abort).toHaveBeenCalledTimes(1)
    expect(recognition.onresult).toBeNull()
  })

  it('no MediaRecorder conflict: dictation never opens getUserMedia or a MediaRecorder', () => {
    const { deps, recorders, speech } = setup()
    openSpeech()
    const recognition = startListening(speech)
    act(() => recognition.onresult(result([['text', true]])))
    fireEvent.click(screen.getByRole('button', { name: 'Stoppa lyssning' }))
    expect(deps.getUserMedia).not.toHaveBeenCalled()
    expect(recorders).toHaveLength(0)
    expect(deps.interpret).not.toHaveBeenCalled()
  })

  it('no MediaRecorder conflict: while a recording runs, Tal → text cannot be chosen', async () => {
    const { recorders } = setup()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Spela in' })))
    expect(recorders).toHaveLength(1)
    expect(speechRadio().matches(':disabled')).toBe(true)
    expect(panel()).toBeNull()
  })
})
