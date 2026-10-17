import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./ai/aiAuthTransport.js', () => ({
  getCurrentAiAuthorization: vi.fn(async () => ({ authorizationHeader: 'Bearer owner', ok: true, userScope: 'owner' })),
  hasSameAiAuthUser: vi.fn(async () => true),
}))
vi.mock('./security/analysisConsentProof.js', async (importOriginal) => ({
  ...await importOriginal(),
  requestAnalysisConsentToken: vi.fn(async () => ({ token: 'consent' })),
}))

const { HUMMING_CERTAIN_SCORE, identifyHumming } = await import('./aiEarProviders.js')

const wav = new Blob([new Uint8Array(64)], { type: 'audio/wav' })

function reply(result) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ matched: true, ok: true, requestId: 'r', result }), ok: true, status: 200 })))
}

describe('Humma / sjung: certain match or suggestion (no API call, fetch is stubbed)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('a high ACRCloud score is a certain match; the score itself is not passed on', async () => {
    reply({ alternatives: [{ artist: 'B', score: 0.5, title: 'Andra' }], artist: 'Enrique Iglesias', score: 0.92, title: 'Bailando' })
    const outcome = await identifyHumming({ consentApproved: true, wav })
    expect(outcome).toMatchObject({ matched: true, ok: true, result: { artist: 'Enrique Iglesias', certain: true, title: 'Bailando' } })
    expect(JSON.stringify(outcome)).not.toMatch(/score|0\.92|0\.5/)
  })

  it('a low score, or no score, is only a suggestion', async () => {
    reply({ alternatives: [], artist: 'El Hasnaoui', score: HUMMING_CERTAIN_SCORE - 0.01, title: "Merhaba l'ehbab" })
    expect((await identifyHumming({ consentApproved: true, wav })).result.certain).toBe(false)
    reply({ alternatives: [], artist: 'X', title: 'Utan poäng' })
    expect((await identifyHumming({ consentApproved: true, wav })).result.certain).toBe(false)
  })
})
