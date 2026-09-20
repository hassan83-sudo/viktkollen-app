/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { aiEarRouteInternals } from '../../../api/ai-ear/interpret/index.js'
import AiEarMode from './AiEarMode.jsx'
import { backendFixtures } from './fixtures/backendFixtures.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const wavBlob = new Blob([new Uint8Array(200)], { type: 'audio/wav' })
const allProviders = { humming: true, music: true, transcription: true }
const birdOutcome = () => ({ ok: true, result: aiEarRouteInternals.reduceBackendResult(backendFixtures.species_candidate__lead) })

function makeDeps(overrides = {}) {
  return {
    blobToWav: vi.fn(async () => ({ seconds: 3, truncated: false, wav: wavBlob })),
    identifyHumming: vi.fn(async () => ({ matched: true, ok: true, result: { album: 'Alb', alternatives: [{ artist: 'Art2', title: 'Alt One' }], artist: 'Art', provider: 'ACRCloud', title: 'Hummed Song' } })),
    identifyMusic: vi.fn(async () => ({ matched: true, ok: true, result: { album: 'Test Album', artist: 'Test Artist', provider: 'AudD', releaseYear: '2019', title: 'Test Song' } })),
    interpret: vi.fn(async () => birdOutcome()),
    loadProviderStatus: vi.fn(async () => allProviders),
    transcribeSpeech: vi.fn(async () => ({ language: 'sv', noSpeech: false, ok: true, transcript: 'några ord ur en låt' })),
    ...overrides,
  }
}

async function mount(deps) {
  render(<AiEarMode deps={deps} />)
  await screen.findByRole('button', { name: 'Fåglar & ljud' }).catch(() => null)
}

function chooseFile() {
  fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [new File([new Uint8Array(10)], 'ljud.mp3', { type: 'audio/mpeg' })] } })
}

async function pickMode(label) {
  fireEvent.click(await screen.findByRole('button', { name: label }))
}

describe('AiEarMode — Sprint 12A: current AI-örat plus three re-integrated features', () => {
  afterEach(() => cleanup())

  it('shows no extra modes (and the unchanged sound UI) when no provider is configured', async () => {
    const deps = makeDeps({ loadProviderStatus: vi.fn(async () => ({ humming: false, music: false, transcription: false })) })
    render(<AiEarMode deps={deps} />)
    await act(async () => {})

    expect(screen.queryByRole('navigation', { name: /Välj vad AI-örat/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Spela in' })).toBeTruthy()
    expect(screen.getByText(/fågel, tal, musik/)).toBeTruthy()
  })

  it('offers only the configured features, next to the existing bird/sound mode', async () => {
    const deps = makeDeps({ loadProviderStatus: vi.fn(async () => ({ humming: false, music: true, transcription: true })) })
    render(<AiEarMode deps={deps} />)

    expect(await screen.findByRole('button', { name: 'Identifiera musik' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ord ur en låt' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fåglar & ljud' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Nynna / vissla / sjung' })).toBeNull()
  })

  it('keeps bird/sound analysis working as before when other features exist', async () => {
    const deps = makeDeps()
    await mount(deps)
    chooseFile()
    fireEvent.click(await screen.findByText('Analysera ljudet'))

    expect((await screen.findAllByText(/rödhake/)).length).toBeGreaterThan(0)
    expect(deps.interpret).toHaveBeenCalledTimes(1)
    expect(deps.interpret.mock.calls[0][0]).toMatchObject({ consentApproved: true, locale: 'sv-SE', wav: wavBlob })
    expect(deps.identifyMusic).not.toHaveBeenCalled()
    expect(deps.identifyHumming).not.toHaveBeenCalled()
    expect(deps.transcribeSpeech).not.toHaveBeenCalled()
  })

  it('music: names the provider before sending, then shows title, artist, album and year', async () => {
    const deps = makeDeps()
    await mount(deps)
    await pickMode('Identifiera musik')
    chooseFile()
    await screen.findByText('Identifiera musiken')
    expect(screen.getByText(/extern musiktjänst \(AudD\)/)).toBeTruthy()
    expect(deps.identifyMusic).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Identifiera musiken'))
    expect(await screen.findByText('Det här verkar vara Test Song')).toBeTruthy()
    expect(screen.getByText('Artist: Test Artist')).toBeTruthy()
    expect(screen.getByText('Album: Test Album')).toBeTruthy()
    expect(screen.getByText('Utgivningsår: 2019')).toBeTruthy()
    expect(deps.identifyMusic.mock.calls[0][0]).toMatchObject({ consentApproved: true, wav: wavBlob })
    expect(deps.interpret).not.toHaveBeenCalled()
  })

  it('music: no match gives a normal "no confident match" result with tips', async () => {
    const deps = makeDeps({ identifyMusic: vi.fn(async () => ({ matched: false, ok: true })) })
    await mount(deps)
    await pickMode('Identifiera musik')
    chooseFile()
    fireEvent.click(await screen.findByText('Identifiera musiken'))

    expect(await screen.findByText('Ingen säker musikträff hittades')).toBeTruthy()
    expect(screen.getByText('Håll telefonen närmare musiken.')).toBeTruthy()
  })

  it('humming: shows a cautious best guess, alternatives, and never a score', async () => {
    const deps = makeDeps()
    await mount(deps)
    await pickMode('Nynna / vissla / sjung')
    chooseFile()
    await screen.findByText('Identifiera melodin')
    expect(screen.getByText(/extern meloditjänst \(ACRCloud\)/)).toBeTruthy()
    fireEvent.click(screen.getByText('Identifiera melodin'))

    expect(await screen.findByText('Kanske Hummed Song')).toBeTruthy()
    expect(screen.getByText(/melodiigenkänning är osäker/)).toBeTruthy()
    expect(screen.getByText('Alt One – Art2')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/%|procent|score/i)
  })

  it('humming: no match', async () => {
    const deps = makeDeps({ identifyHumming: vi.fn(async () => ({ matched: false, ok: true })) })
    await mount(deps)
    await pickMode('Nynna / vissla / sjung')
    chooseFile()
    fireEvent.click(await screen.findByText('Identifiera melodin'))

    expect(await screen.findByText('Ingen säker meloditräff hittades')).toBeTruthy()
  })

  it('transcription: shows the words as a quote, says nothing is stored, and names the provider first', async () => {
    const deps = makeDeps()
    await mount(deps)
    await pickMode('Ord ur en låt')
    chooseFile()
    await screen.findByText('Skriv ut orden')
    expect(screen.getByText(/extern taligenkänningstjänst \(OpenAI\)/)).toBeTruthy()
    fireEvent.click(screen.getByText('Skriv ut orden'))

    expect(await screen.findByText('Jag hörde:')).toBeTruthy()
    expect(document.querySelector('blockquote').textContent).toBe('några ord ur en låt')
    expect(screen.getByText(/Den sparas inte/)).toBeTruthy()
  })

  it('transcription: no speech', async () => {
    const deps = makeDeps({ transcribeSpeech: vi.fn(async () => ({ noSpeech: true, ok: true, transcript: '' })) })
    await mount(deps)
    await pickMode('Ord ur en låt')
    chooseFile()
    fireEvent.click(await screen.findByText('Skriv ut orden'))

    expect(await screen.findByText('Jag hörde ingen tydlig text i inspelningen')).toBeTruthy()
    expect(document.querySelector('blockquote')).toBeNull()
  })

  it('isolates providers: a failing music provider shows its own message and leaves bird analysis working', async () => {
    const deps = makeDeps({ identifyMusic: vi.fn(async () => ({ ok: false, reason: 'service_unavailable', retryable: true })) })
    await mount(deps)
    await pickMode('Identifiera musik')
    chooseFile()
    fireEvent.click(await screen.findByText('Identifiera musiken'))

    expect(await screen.findByText('Musikigenkänningen är tillfälligt otillgänglig')).toBeTruthy()
    expect(screen.getByText(/Fågel- och ljudanalysen påverkas inte/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Ny inspelning' }))
    await pickMode('Fåglar & ljud')
    chooseFile()
    fireEvent.click(await screen.findByText('Analysera ljudet'))
    expect((await screen.findAllByText(/rödhake/)).length).toBeGreaterThan(0)
  })

  it.each([
    ['Nynna / vissla / sjung', 'identifyHumming', 'Melodiigenkänningen är inte tillgänglig just nu', 'Identifiera melodin'],
    ['Ord ur en låt', 'transcribeSpeech', 'Taligenkänningen är inte tillgänglig just nu', 'Skriv ut orden'],
  ])('%s: a "not configured" answer reads as that feature being unavailable', async (label, depName, title, action) => {
    const deps = makeDeps({ [depName]: vi.fn(async () => ({ ok: false, reason: 'not_available', retryable: false })) })
    await mount(deps)
    await pickMode(label)
    chooseFile()
    fireEvent.click(await screen.findByText(action))

    expect(await screen.findByText(title)).toBeTruthy()
  })

  it('retries the same recording in the current mode and keeps modes from switching mid-request', async () => {
    let resolve
    const identifyMusic = vi.fn()
      .mockReturnValueOnce(new Promise((r) => { resolve = r }))
      .mockResolvedValueOnce({ matched: false, ok: true })
    const deps = makeDeps({ identifyMusic })
    await mount(deps)
    await pickMode('Identifiera musik')
    chooseFile()
    fireEvent.click(await screen.findByText('Identifiera musiken'))
    await screen.findByText(/AI-örat lyssnar/)

    expect(screen.getByRole('button', { name: 'Fåglar & ljud' }).disabled).toBe(true)
    await act(async () => resolve({ ok: false, reason: 'timeout', retryable: true }))
    fireEvent.click(await screen.findByRole('button', { name: 'Försök igen' }))
    expect(await screen.findByText('Ingen säker musikträff hittades')).toBeTruthy()
    expect(identifyMusic).toHaveBeenCalledTimes(2)
    expect(identifyMusic.mock.calls[1][0].wav).toBe(wavBlob)
  })

  it('cancels a provider request without an error and aborts on unmount', async () => {
    let signal
    const deps = makeDeps({ transcribeSpeech: vi.fn((args) => new Promise((resolve) => { signal = args.signal; signal.addEventListener('abort', () => resolve({ ok: false, reason: 'aborted' })) })) })
    await mount(deps)
    await pickMode('Ord ur en låt')
    chooseFile()
    fireEvent.click(await screen.findByText('Skriv ut orden'))
    fireEvent.click(await screen.findByText('Avbryt'))

    expect(await screen.findByText('Skriv ut orden')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(signal.aborted).toBe(true)
  })

  it('does not write recordings or transcripts to browser storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const deps = makeDeps()
    await mount(deps)
    await pickMode('Ord ur en låt')
    chooseFile()
    fireEvent.click(await screen.findByText('Skriv ut orden'))
    await screen.findByText('Jag hörde:')

    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })
})
