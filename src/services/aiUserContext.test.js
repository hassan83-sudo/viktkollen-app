import { describe, expect, it } from 'vitest'

import { buildAiUserContext, pickAiUserContextForIntent } from './aiUserContext.js'

describe('AI user context profile integration', () => {
  it('sends compact normalized profile context without raw profile secrets', () => {
    const context = buildAiUserContext({
      profile: {
        activityLevel: 'Hög',
        displayName: 'Ali',
        goalWeight: '82 kg',
        height: '181',
        session: { access_token: 'secret' },
        weightDirection: 'loss',
      },
      today: '2026-08-19',
      weights: [{ date: '2026-08-19', source: 'Manuell', value: 88.4 }],
    })

    expect(context.profile).toMatchObject({
      activityLevel: 'high',
      displayName: 'Ali',
      goalWeight: 82,
      heightCm: 181,
      weightDirection: 'loss',
    })
    expect(context.weight.currentWeight).toBe(88.4)
    expect(context.weight.provenance.status).toBe('measured')
    expect(JSON.stringify(context.profile)).not.toMatch(/secret|session|access_token/)
  })

  it('keeps body-analysis intent limited to relevant profile, body and weight context', () => {
    const context = buildAiUserContext({
      profile: { displayName: 'Ali', height: 181 },
      today: '2026-08-19',
      weights: [],
    })
    const picked = pickAiUserContextForIntent(context, 'bodyAnalysis')

    expect(Object.keys(picked).sort()).toEqual(['bodyAnalysis', 'coachConversation', 'intent', 'profile', 'weight'])
    expect(picked.profile.heightCm).toBe(181)
    expect(picked.weight.currentWeight).toBeNull()
  })
})
