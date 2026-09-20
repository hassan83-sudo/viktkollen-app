/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { aiEarRouteInternals } from '../../../api/ai-ear/interpret/index.js'
import AiEarMode from './AiEarMode.jsx'
import { backendFixtures } from './fixtures/backendFixtures.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const reduced = (key) => aiEarRouteInternals.reduceBackendResult(backendFixtures[key])
const wavBlob = new Blob([new Uint8Array(200)], { type: 'audio/wav' })

function chooseFile(file = new File([new Uint8Array(10)], 'ljud.mp3', { type: 'audio/mpeg' })) {
  const input = document.querySelector('input[type="file"]')
  fireEvent.change(input, { target: { files: [file] } })
}

function makeDeps(overrides = {}) {
  return {
    blobToWav: vi.fn(async () => ({ seconds: 3, truncated: false, wav: wavBlob })),
    interpret: vi.fn(async () => ({ ok: true, result: reduced('species_candidate__lead') })),
    ...overrides,
  }
}

async function readyWithFile(deps) {
  render(<AiEarMode deps={deps} />)
  chooseFile()
  await screen.findByText('Analysera ljudet')
}

function fakeRecorderEnv() {
  const track = { stop: vi.fn() }
  const stream = { getTracks: () => [track] }
  const instances = []
  class FakeRecorder {
    constructor() {
      this.state = 'inactive'
      this.mimeType = 'audio/webm'
      instances.push(this)
    }
    start() { this.state = 'recording' }
    stop() {
      this.state = 'inactive'
      this.ondataavailable?.({ data: new Blob([new Uint8Array(50)]) })
      this.onstop?.()
    }
  }
  return { instances, MediaRecorderImpl: FakeRecorder, stream, track }
}

describe('AiEarMode', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } })
  })
  afterEach(() => cleanup())

  it('starts idle: no microphone, no network, no analysis until the user acts', () => {
    const deps = makeDeps()
    render(<AiEarMode deps={deps} />)

    expect(screen.getByText('Spela in')).toBeTruthy()
    expect(screen.getByText('Välj ljudfil')).toBeTruthy()
    expect(deps.interpret).not.toHaveBeenCalled()
    expect(deps.blobToWav).not.toHaveBeenCalled()
  })

  it('does NOT send audio when a file is only chosen; asks for an explicit tap first', async () => {
    const deps = makeDeps()
    await readyWithFile(deps)

    expect(deps.interpret).not.toHaveBeenCalled()
    expect(screen.getByText(/skickas just det här ljudet/)).toBeTruthy()
    expect(screen.getByText(/Ljudet sparas inte/)).toBeTruthy()
  })

  it('shows a loading state, prevents double submit, and then a bird result', async () => {
    let resolve
    const deps = makeDeps({ interpret: vi.fn(() => new Promise((r) => { resolve = r })) })
    await readyWithFile(deps)

    const button = screen.getByText('Analysera ljudet')
    fireEvent.click(button)
    fireEvent.click(button)
    await screen.findByText(/AI-örat lyssnar/)
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy()
    expect(deps.interpret).toHaveBeenCalledTimes(1)
    expect(deps.interpret.mock.calls[0][0]).toMatchObject({ consentApproved: true, wav: wavBlob })

    await act(async () => resolve({ ok: true, result: reduced('species_candidate__lead') }))
    expect((await screen.findAllByText(/rödhake/)).length).toBeGreaterThan(0)
    expect(screen.getByText(/prototyp/)).toBeTruthy()
  })

  it.each([
    ['speech__withhold', /tal/i],
    ['music__withhold', /musik/i],
    ['human_whistle__withhold', /vissling/i],
    ['unresolved__withhold', /kunde inte avgöra/],
    ['insufficient_signal__withhold', /Ljudsignalen räckte inte/],
    ['unavailable__unavailable', /tillfälligt otillgängligt/],
  ])('renders %s', async (key, pattern) => {
    const deps = makeDeps({ interpret: vi.fn(async () => ({ ok: true, result: reduced(key) })) })
    await readyWithFile(deps)
    fireEvent.click(screen.getByText('Analysera ljudet'))

    expect((await screen.findAllByText(pattern)).length).toBeGreaterThan(0)
    expect(document.querySelector('.ai-ear-species')).toBeNull()
  })

  it('shows the recording advice for insufficient signal', async () => {
    const deps = makeDeps({ interpret: vi.fn(async () => ({ ok: true, result: reduced('insufficient_signal__withhold') })) })
    await readyWithFile(deps)
    fireEvent.click(screen.getByText('Analysera ljudet'))

    expect(await screen.findByText('Spela in närmare ljudet.')).toBeTruthy()
    expect(screen.getByText('Minska bakgrundsljud.')).toBeTruthy()
  })

  it('rejects an oversized or non-audio file before any processing', async () => {
    const deps = makeDeps()
    render(<AiEarMode deps={deps} />)
    chooseFile(new File([new Uint8Array(10)], 'bild.png', { type: 'image/png' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('Det där är inte en ljudfil')).toBeTruthy()
    expect(deps.blobToWav).not.toHaveBeenCalled()

    cleanup()
    render(<AiEarMode deps={deps} />)
    const big = new File([new Uint8Array(10)], 'stor.wav', { type: 'audio/wav' })
    Object.defineProperty(big, 'size', { value: 30 * 1024 * 1024 })
    chooseFile(big)
    expect(await screen.findByText('Ljudfilen är för stor')).toBeTruthy()
    expect(deps.blobToWav).not.toHaveBeenCalled()
  })

  it('shows a friendly message when the audio cannot be decoded', async () => {
    const deps = makeDeps({ blobToWav: vi.fn(async () => { throw new Error('audio_undecodable') }) })
    render(<AiEarMode deps={deps} />)
    chooseFile()
    expect(await screen.findByText('Ljudet kunde inte läsas')).toBeTruthy()
  })

  it('handles a network error and lets the user retry the same recording', async () => {
    const interpret = vi.fn()
      .mockResolvedValueOnce({ ok: false, reason: 'network', retryable: true })
      .mockResolvedValueOnce({ ok: true, result: reduced('speech__withhold') })
    await readyWithFile(makeDeps({ interpret }))
    fireEvent.click(screen.getByText('Analysera ljudet'))

    expect(await screen.findByText('Ingen kontakt med tjänsten')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).not.toMatch(/google|token|403|401|iam/i)
    fireEvent.click(screen.getByText('Försök igen'))
    expect(await screen.findByText(/tal/i)).toBeTruthy()
    expect(interpret).toHaveBeenCalledTimes(2)
    expect(interpret.mock.calls[1][0].wav).toBe(wavBlob)
  })

  it.each([
    ['timeout', 'Det tog för lång tid'],
    ['service_unavailable', 'AI-örat är tillfälligt otillgängligt'],
    ['too_large', 'Ljudfilen är för stor'],
    ['invalid_audio', 'Ljudet kunde inte läsas'],
    ['auth_required', 'Logga in för att använda AI-örat'],
  ])('maps the %s error to friendly copy', async (reason, title) => {
    await readyWithFile(makeDeps({ interpret: vi.fn(async () => ({ ok: false, reason, retryable: true })) }))
    fireEvent.click(screen.getByText('Analysera ljudet'))
    expect(await screen.findByText(title)).toBeTruthy()
  })

  it('cancels an in-flight analysis and returns to the recording without an error', async () => {
    let signal
    const deps = makeDeps({
      interpret: vi.fn((args) => new Promise((resolve) => {
        signal = args.signal
        signal.addEventListener('abort', () => resolve({ ok: false, reason: 'aborted', retryable: false }))
      })),
    })
    await readyWithFile(deps)
    fireEvent.click(screen.getByText('Analysera ljudet'))
    fireEvent.click(await screen.findByText('Avbryt'))

    expect(await screen.findByText('Analysera ljudet')).toBeTruthy()
    expect(signal.aborted).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('aborts the request and updates no state after unmount', async () => {
    let signal
    let resolve
    const deps = makeDeps({ interpret: vi.fn((args) => new Promise((r) => { signal = args.signal; resolve = r })) })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<AiEarMode deps={deps} />)
    chooseFile()
    fireEvent.click(await screen.findByText('Analysera ljudet'))
    await screen.findByText(/AI-örat lyssnar/)

    cleanup()
    expect(signal.aborted).toBe(true)
    await act(async () => resolve({ ok: true, result: reduced('speech__withhold') }))
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('records with the microphone, stops the tracks, and only then offers analysis', async () => {
    const env = fakeRecorderEnv()
    const deps = makeDeps({ getUserMedia: vi.fn(async () => env.stream), MediaRecorderImpl: env.MediaRecorderImpl })
    render(<AiEarMode deps={deps} />)

    fireEvent.click(screen.getByText('Spela in'))
    expect(await screen.findByText(/Mikrofon aktiv/)).toBeTruthy()
    expect(deps.getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(deps.interpret).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Stoppa inspelningen'))
    await screen.findByText('Analysera ljudet')
    expect(env.track.stop).toHaveBeenCalled()
    expect(deps.blobToWav).toHaveBeenCalled()
    expect(deps.interpret).not.toHaveBeenCalled()
  })

  it('stops the microphone if the component unmounts while recording', async () => {
    const env = fakeRecorderEnv()
    const deps = makeDeps({ getUserMedia: vi.fn(async () => env.stream), MediaRecorderImpl: env.MediaRecorderImpl })
    render(<AiEarMode deps={deps} />)
    fireEvent.click(screen.getByText('Spela in'))
    await screen.findByText(/Mikrofon aktiv/)

    cleanup()
    expect(env.track.stop).toHaveBeenCalled()
  })

  it('explains denied microphone permission and offers the file alternative', async () => {
    const deps = makeDeps({ getUserMedia: vi.fn(async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }) }), MediaRecorderImpl: class {} })
    render(<AiEarMode deps={deps} />)
    fireEvent.click(screen.getByText('Spela in'))

    expect(await screen.findByText('Mikrofonen är inte tillåten')).toBeTruthy()
    fireEvent.click(screen.getByText('Ny inspelning'))
    expect(screen.getByText('Välj ljudfil')).toBeTruthy()
  })

  it('keeps recordings out of storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    await readyWithFile(makeDeps())
    fireEvent.click(screen.getByText('Analysera ljudet'))
    await waitFor(() => expect(screen.getByText('Ny inspelning')).toBeTruthy())
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })
})
