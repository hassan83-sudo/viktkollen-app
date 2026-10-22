/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { aiEarRouteInternals } from '../../../api/ai-ear/interpret/index.js'
import { LAUNCH_UNMETERED_FEATURES } from '../../services/billing/commercialPlanMatrix.js'
import i18n from '../../i18n/index.js'
import AiEarMode from './AiEarMode.jsx'
import { aiEarModes } from './aiEarModes.js'
import { backendFixtures } from './fixtures/backendFixtures.js'

// AI-EAR-1: four separate modes inside AI Örat. Sound and bird use the
// existing free server hop; speech (AI-EAR-2C1) is free and runs in the
// browser; melody stays locked until the server confirms the billing admin.

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const reduced = (key) => aiEarRouteInternals.reduceBackendResult(backendFixtures[key])
const wavBlob = new Blob([new Uint8Array(200)], { type: 'audio/wav' })
const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

function makeDeps(result = 'species_candidate__lead') {
  return {
    blobToWav: vi.fn(async () => ({ seconds: 3, truncated: false, wav: wavBlob })),
    interpret: vi.fn(async () => ({ ok: true, result: reduced(result) })),
  }
}

function chooseFile() {
  fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [new File([new Uint8Array(10)], 'ljud.mp3', { type: 'audio/mpeg' })] } })
}

async function analyseIn(modeName, result) {
  const deps = makeDeps(result)
  render(<AiEarMode deps={deps} />)
  fireEvent.click(screen.getByRole('radio', { name: modeName }))
  chooseFile()
  fireEvent.click(await screen.findByRole('button', { name: 'Analysera ljudet' }))
  const footer = await screen.findByText(/prototyp/)
  return { deps, result: footer.closest('[role="status"]') }
}

describe('AI Örat modes (AI-EAR-1)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sv')
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } })
  })
  afterEach(() => cleanup())

  it('shows four modes as one named radio group without access badges', () => {
    render(<AiEarMode deps={makeDeps()} />)
    const group = screen.getByRole('group', { name: 'Vad vill du använda?' })
    const radios = within(group).getAllByRole('radio')
    expect(radios).toHaveLength(4)
    const expected = [
      [/^Ljudigenkänning Känn igen ljud omkring dig$/, true],
      [/^Fågelljud Försök identifiera fågellätet$/, false],
      [/^Tal → text Gör tal till skriven text$/, false],
      [/^Humma \/ sjung Analysera hummad eller sjungen melodi$/, false],
    ]
    expected.forEach(([name, checked], index) => {
      expect(within(group).getByRole('radio', { name })).toBe(radios[index])
      expect(radios[index].checked).toBe(checked)
      expect(radios[index].name).toBe('ai-ear-mode')
    })
    // The icon is decorative.
    expect(group.querySelectorAll('[aria-hidden="true"]')).toHaveLength(4)
  })

  it('changes the heading and the instructions with the selected mode', () => {
    render(<AiEarMode deps={makeDeps()} />)
    const cases = [
      ['Fågelljud', 'Spela in fågeln så tydligt som möjligt.'],
      ['Tal → text', 'Tryck på Starta lyssning och prata. Texten visas medan du pratar.'],
      ['Humma / sjung', 'Humma eller sjung melodin.'],
      ['Ljudigenkänning', 'Spela in ett ljud omkring dig.'],
    ]
    for (const [title, instruction] of cases) {
      fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${title.replace(/[/→]/g, '.')}`) }))
      expect(screen.getByRole('heading', { level: 4 }).textContent).toBe(title)
      expect(screen.getByText(instruction)).toBeTruthy()
    }
  })

  // AI-EAR-2C: Tal → text runs in the browser. Humma / sjung is owner-only:
  // everyone else sees it locked, with no recorder and no request.
  it('Tal → text cannot record a file; Humma / sjung is locked for an ordinary user', async () => {
    const deps = { ...makeDeps(), identifyHumming: vi.fn(), loadHummingAccess: vi.fn(async () => false) }
    render(<AiEarMode deps={deps} />)
    fireEvent.click(screen.getByRole('radio', { name: /^Tal → text/ }))
    expect(screen.queryByRole('button', { name: 'Spela in' })).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: /^Humma \/ sjung/ }))
    expect(screen.getByText('Humma / sjung kräver Premium och är inte tillgängligt ännu. Inget ljud skickas.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Spela in' })).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
    expect(deps.loadHummingAccess).toHaveBeenCalledTimes(1)
    expect(deps.identifyHumming).not.toHaveBeenCalled()
    expect(deps.interpret).not.toHaveBeenCalled()
  })

  it('Humma / sjung is locked when the owner check fails', async () => {
    const deps = { ...makeDeps(), identifyHumming: vi.fn(), loadHummingAccess: vi.fn(async () => { throw new Error('offline') }) }
    render(<AiEarMode deps={deps} />)
    fireEvent.click(screen.getByRole('radio', { name: /^Humma \/ sjung/ }))
    await Promise.resolve()
    expect(screen.queryByRole('button', { name: 'Spela in' })).toBeNull()
    expect(deps.identifyHumming).not.toHaveBeenCalled()
  })

  it('Humma / sjung records and asks ACRCloud only for the verified owner', async () => {
    const identifyHumming = vi.fn(async () => ({ matched: true, ok: true, result: { alternatives: [{ artist: 'B', title: 'Andra låten' }], artist: 'Artist A', certain: true, title: 'Låten' } }))
    const deps = { ...makeDeps(), identifyHumming, loadHummingAccess: vi.fn(async () => true) }
    render(<AiEarMode deps={deps} />)
    fireEvent.click(screen.getByRole('radio', { name: /^Humma \/ sjung/ }))
    expect(await screen.findByRole('button', { name: 'Spela in' })).toBeTruthy()
    expect(screen.queryByText('Humma / sjung kräver Premium och är inte tillgängligt ännu. Inget ljud skickas.')).toBeNull()
    chooseFile()
    expect(await screen.findByText('Melodin skickas även till ACRCloud för att föreslå låt och artist. Ljudet sparas inte.')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Analysera ljudet' }))
    expect(await screen.findByText('Låten')).toBeTruthy()
    expect(screen.getByText('Artist A')).toBeTruthy()
    expect(screen.getByText('ACRCloud – resultatet är ett förslag.')).toBeTruthy()
    expect(identifyHumming).toHaveBeenCalledTimes(1)
    expect(identifyHumming.mock.calls[0][0]).toMatchObject({ consentApproved: true, wav: wavBlob })
    expect(deps.interpret).not.toHaveBeenCalled()
  })

  it('Humma / sjung shows an uncertain ACRCloud match only as suggestions', async () => {
    const identifyHumming = vi.fn(async () => ({ matched: true, ok: true, result: { alternatives: [{ artist: 'B', title: 'Andra låten' }], artist: 'El Hasnaoui', certain: false, title: "Merhaba l'ehbab" } }))
    const deps = { ...makeDeps(), identifyHumming, loadHummingAccess: vi.fn(async () => true) }
    render(<AiEarMode deps={deps} />)
    fireEvent.click(screen.getByRole('radio', { name: /^Humma \/ sjung/ }))
    await screen.findByRole('button', { name: 'Spela in' })
    chooseFile()
    fireEvent.click(await screen.findByRole('button', { name: 'Analysera ljudet' }))
    const result = (await screen.findByText('Osäker träff')).closest('[role="status"]')
    expect(result.querySelector('h5').textContent).toBe('Osäker träff')
    expect(within(result).getByText('Kanske någon av dessa')).toBeTruthy()
    expect([...result.querySelectorAll('.ai-ear-alternatives li')].map((li) => li.textContent)).toEqual(["Merhaba l'ehbab – El Hasnaoui", 'Andra låten – B'])
    expect(result.textContent).not.toMatch(/\d\s?%/)
  })

  it('Humma / sjung records with call processing off, shows the ACRCloud notice first and identifies right after the stop', async () => {
    const recorders = []
    class FakeRecorder {
      constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; recorders.push(this) }
      start() { this.state = 'recording' }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array(40)]) }); this.onstop?.() }
    }
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }))
    const identifyHumming = vi.fn(async () => ({ matched: true, ok: true, result: { alternatives: [], artist: 'Enrique Iglesias', certain: true, title: 'Bailando' } }))
    const deps = { ...makeDeps(), createLevelMeter: () => null, getUserMedia, identifyHumming, loadHummingAccess: vi.fn(async () => true), MediaRecorderImpl: FakeRecorder }
    render(<AiEarMode deps={deps} />)
    fireEvent.click(screen.getByRole('radio', { name: /^Humma \/ sjung/ }))
    const record = await screen.findByRole('button', { name: 'Spela in' })
    expect(record.getAttribute('aria-describedby')).toBe('ai-ear-humming-start-notice')
    expect(document.getElementById('ai-ear-humming-start-notice').textContent).toContain('ACRCloud')
    fireEvent.click(record)
    await screen.findByRole('button', { name: 'Stoppa inspelningen' })
    expect(getUserMedia).toHaveBeenCalledWith({ audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false } })
    expect(screen.getByText(/stoppar av sig själv/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Stoppa inspelningen' }))
    expect(await screen.findByText('Bailando')).toBeTruthy()
    expect(deps.blobToWav).toHaveBeenCalledWith(expect.any(Blob), { maxSeconds: 20 })
    expect(identifyHumming).toHaveBeenCalledTimes(1)
    expect(identifyHumming.mock.calls[0][0]).toMatchObject({ consentApproved: true, wav: wavBlob })
    expect(screen.queryByRole('button', { name: 'Analysera ljudet' })).toBeNull()
  })

  it('other AI Örat modes keep the default microphone, 12 s and the Analysera step', async () => {
    class FakeRecorder {
      constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm' }
      start() { this.state = 'recording' }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array(40)]) }); this.onstop?.() }
    }
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }))
    const createLevelMeter = vi.fn(() => null)
    const deps = { ...makeDeps(), createLevelMeter, getUserMedia, loadHummingAccess: vi.fn(async () => true), MediaRecorderImpl: FakeRecorder }
    render(<AiEarMode deps={deps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Spela in' }))
    await screen.findByRole('button', { name: 'Stoppa inspelningen' })
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(createLevelMeter).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Stoppa inspelningen' }))
    expect(await screen.findByRole('button', { name: 'Analysera ljudet' })).toBeTruthy()
    expect(deps.blobToWav).toHaveBeenCalledWith(expect.any(Blob), { maxSeconds: 12 })
    expect(deps.interpret).not.toHaveBeenCalled()
  })

  it('Humma / sjung results are localized (English)', async () => {
    await i18n.changeLanguage('en')
    const deps = { ...makeDeps(), identifyHumming: vi.fn(async () => ({ matched: false, ok: true })), loadHummingAccess: vi.fn(async () => true) }
    render(<AiEarMode deps={deps} />)
    fireEvent.click(screen.getByRole('radio', { name: /^Hum \/ sing/ }))
    await screen.findByRole('button', { name: 'Record' })
    chooseFile()
    fireEvent.click(await screen.findByRole('button', { name: 'Analyse the sound' }))
    expect(await screen.findByText('No melody found')).toBeTruthy()
    expect(screen.getByText('Try humming more clearly or record again.')).toBeTruthy()
    expect(screen.getByText('ACRCloud – the result is a suggestion.')).toBeTruthy()
    await i18n.changeLanguage('sv')
  })

  it('bird mode: the leading species as "Mest sannolikt", the rest as alternatives, no confidence', async () => {
    const { result } = await analyseIn(/^Fågelljud/, 'species_candidate__lead')
    expect(within(result).getByText('Mest sannolikt')).toBeTruthy()
    expect(result.querySelector('h5').textContent).toBe('rödhake (Erithacus rubecula)')
    expect(within(result).getByText('Alternativ')).toBeTruthy()
    expect([...result.querySelectorAll('.ai-ear-alternatives li')].map((li) => li.textContent)).toEqual(['blåmes (Cyanistes caeruleus)', 'Phylloscopus collybita', 'Sylvia atricapilla', 'Turdus philomelos'])
    // The hop strips scores: nothing looks like a probability.
    expect(result.textContent).not.toMatch(/\d\s?%|säkerhet/i)
  })

  it('bird mode: an uncertain species keeps its caveat; speech says no bird was clearly heard', async () => {
    let { result } = await analyseIn(/^Fågelljud/, 'species_candidate__caveat')
    expect(result.textContent).toContain('Möjlig kandidat, osäker: nötskrika')
    expect(within(result).queryByText('Mest sannolikt')).toBeNull()
    cleanup()
    ;({ result } = await analyseIn(/^Fågelljud/, 'speech__withhold'))
    expect(within(result).getByText('Ingen fågel hördes tydligt')).toBeTruthy()
  })

  it('sound mode: "AI hör" with the sound classes the model returned', async () => {
    const { deps, result } = await analyseIn(/^Ljudigenkänning/, 'mixed_scene__withhold')
    expect(within(result).getByText('AI hör')).toBeTruthy()
    expect([...result.querySelectorAll('.ai-ear-context li')].map((li) => li.textContent)).toEqual(['Hund', 'Tal'])
    expect(deps.interpret).toHaveBeenCalledTimes(1)
    expect(deps.interpret.mock.calls[0][0]).toMatchObject({ consentApproved: true })
  })

  it('the modes cannot change while recording or analysing', async () => {
    const deps = { ...makeDeps(), interpret: vi.fn(() => new Promise(() => {})) }
    render(<AiEarMode deps={deps} />)
    chooseFile()
    fireEvent.click(await screen.findByRole('button', { name: 'Analysera ljudet' }))
    expect(screen.getByRole('group', { name: 'Vad vill du använda?' }).disabled).toBe(true)
  })

  it('is localized (English)', async () => {
    await i18n.changeLanguage('en')
    render(<AiEarMode deps={makeDeps()} />)
    expect(screen.getByRole('group', { name: 'What do you want to use?' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /^Speech → text Turn speech into written text$/ })).toBeTruthy()
    await i18n.changeLanguage('sv')
  })

  it('access follows the verified execution paths; the client never holds ACRCloud credentials', () => {
    expect(aiEarModes.map(({ access, execution, id }) => [id, access, execution])).toEqual([
      ['sound', 'free', 'interpret'],
      ['bird', 'free', 'interpret'],
      ['speech', 'free', 'browser'],
      ['melody', 'premium', 'local'],
    ])
    // Sound and bird run on ai.ear.interpret, which billing keeps free and
    // unmetered at launch.
    expect(LAUNCH_UNMETERED_FEATURES).toContain('ai.ear.interpret')
    const code = ['src/features/ai-ear/AiEarMode.jsx', 'src/features/ai-ear/aiEarModes.js', 'src/services/aiEarInterpret.js', 'src/services/aiEarProviders.js']
      .map((path) => source(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))
      .join('\n')
    expect(code).toMatch(/\/api\/ai-ear-humming-recognition/)
    expect(code).not.toMatch(/ACRCLOUD_|acrcloud\.com|AUDD_|OPENAI_API_KEY|access_secret/i)
  })

  // AI-EAR-2C1: free means no gate at all, not a client-side check.
  it('Tal → text needs no entitlement, billing, quota or Supabase; Humma / sjung uses the humming hop', () => {
    const code = ['src/features/ai-ear/AiEarMode.jsx', 'src/features/ai-ear/AiEarDictation.jsx', 'src/services/aiEarDictation.js']
      .map((path) => source(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))
      .join('\n')
    expect(code).not.toMatch(/billing|entitlement|quota|supabase|featureCostGate|\/api\//i)
    const melody = aiEarModes.find((mode) => mode.id === 'melody')
    expect(melody).toMatchObject({ access: 'premium', execution: 'local' })
  })
})
