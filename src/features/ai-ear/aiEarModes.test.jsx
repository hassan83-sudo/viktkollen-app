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
// browser; melody is Premium and not connected, so it can never send audio
// from this client.

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

  it('shows four modes as one named radio group, with the verified access as text', () => {
    render(<AiEarMode deps={makeDeps()} />)
    const group = screen.getByRole('group', { name: 'Vad vill du använda?' })
    const radios = within(group).getAllByRole('radio')
    expect(radios).toHaveLength(4)
    const expected = [
      [/^Ljudigenkänning Känn igen ljud omkring dig Gratis$/, true],
      [/^Fågelljud Försök identifiera fågellätet Gratis$/, false],
      [/^Tal → text Gör tal till skriven text Gratis$/, false],
      [/^Humma \/ sjung Analysera hummad eller sjungen melodi Premium$/, false],
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

  // AI-EAR-2C: Tal → text runs in the browser. Humma / sjung shows the same
  // record and file controls, and still never calls the sound server.
  it('Tal → text cannot record a file; Humma / sjung shows the recorder without sending audio', async () => {
    const deps = makeDeps()
    render(<AiEarMode deps={deps} />)
    fireEvent.click(screen.getByRole('radio', { name: /^Tal → text/ }))
    expect(screen.queryByRole('button', { name: 'Spela in' })).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: /^Humma \/ sjung/ }))
    expect(screen.getByRole('button', { name: 'Spela in' })).toBeTruthy()
    expect(screen.getByText('Välj ljudfil')).toBeTruthy()
    expect(screen.queryByText('Humma / sjung kräver Premium och är inte tillgängligt ännu. Inget ljud skickas.')).toBeNull()
    chooseFile()
    fireEvent.click(await screen.findByRole('button', { name: 'Analysera ljudet' }))
    expect(screen.getByText('Humma / sjung kräver Premium och är inte tillgängligt ännu. Inget ljud skickas.')).toBeTruthy()
    expect(deps.interpret).not.toHaveBeenCalled()
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
    expect(screen.getByRole('radio', { name: /^Speech → text Turn speech into written text Free$/ })).toBeTruthy()
    await i18n.changeLanguage('sv')
  })

  it('access follows the verified execution paths; no paid provider is reachable from AI Örat', () => {
    expect(aiEarModes.map(({ access, execution, id }) => [id, access, execution])).toEqual([
      ['sound', 'free', 'interpret'],
      ['bird', 'free', 'interpret'],
      ['speech', 'free', 'browser'],
      ['melody', 'premium', 'local'],
    ])
    // Sound and bird run on ai.ear.interpret, which billing keeps free and
    // unmetered at launch.
    expect(LAUNCH_UNMETERED_FEATURES).toContain('ai.ear.interpret')
    // Code only: the comments name the providers to explain why they are not here.
    const code = ['src/features/ai-ear/AiEarMode.jsx', 'src/features/ai-ear/aiEarModes.js', 'src/services/aiEarInterpret.js']
      .map((path) => source(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))
      .join('\n')
    expect(code).not.toMatch(/ai-ear-(lyrics|humming|music)|acrcloud|audd|api\.openai|\/v1\/audio/i)
  })

  // AI-EAR-2C1: free means no gate at all, not a client-side check.
  it('Tal → text needs no entitlement, billing, quota or Supabase; Humma / sjung stays locked', () => {
    const code = ['src/features/ai-ear/AiEarMode.jsx', 'src/features/ai-ear/AiEarDictation.jsx', 'src/services/aiEarDictation.js']
      .map((path) => source(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))
      .join('\n')
    expect(code).not.toMatch(/billing|entitlement|quota|supabase|featureCostGate|\/api\//i)
    const melody = aiEarModes.find((mode) => mode.id === 'melody')
    expect(melody).toMatchObject({ access: 'premium', execution: 'local' })
  })
})
