/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '../../i18n/index.js'
import AiEarMode from './AiEarMode.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function recorderEnv() {
  const track = { stop: vi.fn() }
  const stream = { getTracks: () => [track] }
  class FakeRecorder {
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm' }
    start() { this.state = 'recording' }
    stop() {
      this.state = 'inactive'
      this.ondataavailable?.({ data: new Blob([new Uint8Array(50)]) })
      this.onstop?.()
    }
  }
  return { MediaRecorderImpl: FakeRecorder, stream, track }
}

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

describe('AI-örat: funktionsspärr i appen', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sv')
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('visar ingen inspelning och startar ingen mikrofon medan behörigheten kontrolleras', async () => {
    const pending = deferred()
    const env = recorderEnv()
    const getUserMedia = vi.fn(async () => env.stream)
    render(<AiEarMode deps={{ getUserMedia, loadFeatureAccess: () => pending.promise, MediaRecorderImpl: env.MediaRecorderImpl }} />)
    expect(screen.getByRole('heading', { name: 'AI Örat' })).toBeTruthy()
    expect(await screen.findByText('Kontrollerar om AI Örat är tillgängligt …')).toBeTruthy()
    expect(screen.queryByText('Spela in')).toBeNull()
    expect(screen.queryByLabelText('Välj ljudfil')).toBeNull()
    expect(getUserMedia).not.toHaveBeenCalled()
    await act(async () => { pending.resolve('locked') })
  })

  it('visar "Under utveckling" för vanlig användare: sektionen öppnas, men ingen mikrofon, inspelning, fil eller taligenkänning', async () => {
    const env = recorderEnv()
    const getUserMedia = vi.fn(async () => env.stream)
    render(<AiEarMode deps={{ getUserMedia, loadFeatureAccess: async () => 'locked', MediaRecorderImpl: env.MediaRecorderImpl }} />)
    expect(await screen.findByText('Under utveckling')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'AI Örat' })).toBeTruthy()
    expect(screen.queryByText('Spela in')).toBeNull()
    expect(screen.queryByLabelText('Välj ljudfil')).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByText(/Starta lyssning/)).toBeNull()
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('låter admin spela in först efter en ny godkänd kontroll precis före mikrofonen', async () => {
    const env = recorderEnv()
    const order = []
    const loadFeatureAccess = vi.fn(async () => { order.push('access'); return 'allowed' })
    const getUserMedia = vi.fn(async () => { order.push('microphone'); return env.stream })
    render(<AiEarMode deps={{ getUserMedia, loadFeatureAccess, MediaRecorderImpl: env.MediaRecorderImpl }} />)
    fireEvent.click(await screen.findByText('Spela in'))
    await screen.findByText(/Mikrofon aktiv/)
    expect(order).toEqual(['access', 'access', 'microphone'])
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('startar inte mikrofonen om behörigheten har försvunnit vid tryck, och låser vyn', async () => {
    const env = recorderEnv()
    const answers = ['allowed', 'locked']
    const getUserMedia = vi.fn(async () => env.stream)
    render(<AiEarMode deps={{ getUserMedia, loadFeatureAccess: async () => answers.shift() || 'locked', MediaRecorderImpl: env.MediaRecorderImpl }} />)
    fireEvent.click(await screen.findByText('Spela in'))
    expect(await screen.findByText('Under utveckling')).toBeTruthy()
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('stoppar en pågående inspelning när åtkomsten försvinner', async () => {
    const env = recorderEnv()
    let answer = 'allowed'
    const getUserMedia = vi.fn(async () => env.stream)
    render(<AiEarMode deps={{ getUserMedia, loadFeatureAccess: async () => answer, MediaRecorderImpl: env.MediaRecorderImpl }} />)
    fireEvent.click(await screen.findByText('Spela in'))
    await screen.findByText(/Mikrofon aktiv/)
    expect(env.track.stop).not.toHaveBeenCalled()

    answer = 'locked'
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(await screen.findByText('Under utveckling')).toBeTruthy()
    expect(env.track.stop).toHaveBeenCalled()
    expect(screen.queryByText(/Mikrofon aktiv/)).toBeNull()
  })

  it('låser vyn när servern nekar analysen med FEATURE_LOCKED', async () => {
    let answer = 'allowed'
    const interpret = vi.fn(async () => { answer = 'locked'; return { ok: false, reason: 'feature_locked', retryable: false } })
    const blobToWav = vi.fn(async () => ({ seconds: 3, truncated: false, wav: new Blob([new Uint8Array(200)], { type: 'audio/wav' }) }))
    render(<AiEarMode deps={{ blobToWav, interpret, loadFeatureAccess: async () => answer }} />)
    await screen.findByText('Spela in')
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [new File([new Uint8Array(10)], 'ljud.mp3', { type: 'audio/mpeg' })] } })
    fireEvent.click(await screen.findByText('Analysera ljudet'))
    expect(await screen.findByText('Under utveckling')).toBeTruthy()
    expect(interpret).toHaveBeenCalledTimes(1)
  })
})
