import { describe, expect, it } from 'vitest'

import { aiEarRouteInternals } from '../../../api/ai-ear/interpret/index.js'
import { backendFixtures } from './fixtures/backendFixtures.js'
import { aiEarFooterNote, buildAiEarErrorView, buildAiEarResultView } from './aiEarViewModel.js'

const view = (key) => buildAiEarResultView(aiEarRouteInternals.reduceBackendResult(backendFixtures[key]))

describe('AI-örat contract fixtures -> hop reduction -> view model', () => {
  it('maps every fixture through the hop reducer (contract stays valid)', () => {
    Object.entries(backendFixtures).forEach(([key, fixture]) => {
      const reduced = aiEarRouteInternals.reduceBackendResult(fixture)
      expect(reduced, key).not.toBeNull()
      expect(reduced.state).toBe(fixture.interpretedResult.state)
      expect(reduced).not.toHaveProperty('rawEvidence')
    })
  })

  it('bird lead shows the backend headline and species lines', () => {
    const result = view('species_candidate__lead')
    expect(result.kind).toBe('species_lead')
    expect(result.title).toContain('rödhake')
    expect(result.species.length).toBeGreaterThan(0)
  })

  it('bird caveat shows a hedged single candidate line', () => {
    const result = view('species_candidate__caveat')
    expect(result.kind).toBe('species_caveat')
    expect(result.species).toHaveLength(1)
    expect(result.species[0].text).toMatch(/osäker/i)
  })

  it('speech shows a plain result, never a species and never a transcript', () => {
    const result = view('speech__withhold')
    expect(result.kind).toBe('speech')
    expect(result.species).toEqual([])
    expect(result.body).toMatch(/skriver inte ut vad som sägs/)
  })

  it('music, whistle and mixed scene show context and no species when withheld', () => {
    expect(view('music__withhold').kind).toBe('music')
    expect(view('human_whistle__withhold').kind).toBe('human_whistle')
    const mixed = view('mixed_scene__withhold')
    expect(mixed.kind).toBe('mixed_scene')
    expect(mixed.species).toEqual([])
    expect(mixed.contextLines.length).toBeGreaterThan(0)
  })

  it('mixed scene with a backend caveat shows only the backend caveat line', () => {
    const mixed = view('mixed_scene__caveat')
    expect(mixed.species).toHaveLength(1)
    expect(mixed.species[0].text).toMatch(/osäker/i)
  })

  it('unresolved is neutral and invents no species when withheld', () => {
    const result = view('unresolved__withhold')
    expect(result.kind).toBe('unresolved')
    expect(result.title).toBe('AI-örat kunde inte avgöra ljudet tillräckligt säkert')
    expect(result.species).toEqual([])
  })

  it('insufficient signal gives short UX advice', () => {
    const result = view('insufficient_signal__withhold')
    expect(result.kind).toBe('insufficient_signal')
    expect(result.hints).toEqual(['Spela in närmare ljudet.', 'Minska bakgrundsljud.', 'Försök igen.'])
    expect(result.retryable).toBe(true)
  })

  it('unavailable is a plain temporary error without internals', () => {
    const result = view('unavailable__unavailable')
    expect(result.kind).toBe('unavailable')
    expect(JSON.stringify(result)).not.toMatch(/model|perch|yamnet|partial/i)
  })

  it('never shows species when disposition is withhold, even if the payload carries species lines', () => {
    const result = buildAiEarResultView({
      speciesCandidates: [{ label: 'Erithacus rubecula', rank: 1 }],
      speciesDisposition: 'withhold',
      state: 'species_candidate',
      userFacing: { headline: 'x', speciesLines: ['rödhake'] },
    })
    expect(result.species).toEqual([])
  })

  it('never shows species for speech/music/whistle even with disposition lead (defence in depth)', () => {
    ;['speech', 'music', 'human_whistle'].forEach((state) => {
      const result = buildAiEarResultView({ speciesDisposition: 'lead', state, userFacing: { headline: 'h', speciesLines: ['rödhake'] } })
      expect(result.species, state).toEqual([])
    })
  })

  it('treats unknown states as unavailable instead of guessing', () => {
    expect(buildAiEarResultView({ speciesDisposition: 'lead', state: 'bird_for_sure' }).kind).toBe('unavailable')
    expect(buildAiEarResultView(null).kind).toBe('unavailable')
  })

  it('always carries the prototype footer and no score/percent wording', () => {
    Object.keys(backendFixtures).forEach((key) => {
      const result = view(key)
      expect(result.footer).toBe(aiEarFooterNote)
      expect(JSON.stringify(result)).not.toMatch(/rawScore|%|procent|säkerhet:/i)
    })
  })

  it('maps error reasons to friendly text without internal auth or Google details', () => {
    ;['invalid_audio', 'too_large', 'timeout', 'service_unavailable', 'network', 'auth_required', 'rate_limited', 'not_available'].forEach((reason) => {
      const errorView = buildAiEarErrorView(reason)
      expect(errorView.title).toBeTruthy()
      expect(JSON.stringify(errorView)).not.toMatch(/google|token|iam|invoker|cloud run|403|401/i)
    })
    expect(buildAiEarErrorView('something_new').reason).toBe('service_unavailable')
  })
})
