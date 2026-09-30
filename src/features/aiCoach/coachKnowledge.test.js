import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { helpDomain } from '../sharedAi/helpDomain.js'
import { classifyDomainIntent } from '../sharedAi/domainIntent.js'
import { coachKnowledge } from './coachKnowledge.js'
import { createFixtureCoachContext, projectCoachContext } from './coachContext.js'
import { explainCoachRoute, routeCoachQuestion } from './coachRouter.js'
import { searchCoachKnowledge } from './coachSearch.js'

function ask(content, extra = {}) {
  const route = routeCoachQuestion({
    languageCode: 'sv',
    messages: [{ content, role: 'user' }],
    ...extra,
  })
  return { explained: explainCoachRoute(route, extra.context || null), route }
}

describe('coach knowledge', () => {
  it('stores reusable principles instead of scripted questions', () => {
    expect(coachKnowledge.length).toBeGreaterThanOrEqual(8)
    for (const entry of coachKnowledge) {
      expect(entry.id.startsWith('coach.')).toBe(true)
      expect(entry).not.toHaveProperty('question')
      expect(entry).not.toHaveProperty('answer')
      expect(entry.status).toBe('verified')
      expect(entry.summary.length).toBeGreaterThan(20)
    }
  })

  it('answers a general weight trend without inventing personal numbers', () => {
    const { explained, route } = ask('Hur fungerar vikttrend?')
    expect(route.kind).toBe('local')
    expect(route.entry.id).toBe('coach.weight-trend')
    expect(explained.answer).toMatch(/flera veckor/)
    expect(explained.answer).not.toMatch(/\d+(?:[.,]\d+)?\s*kg/i)
  })

  it('understands a synonym, a typo, and a plateau question', () => {
    expect(ask('Hur får jag i mig mer proteinrik mat?').route.entry.id).toBe('coach.protein')
    expect(ask('Hur får jag in mer protien?').route.entry.id).toBe('coach.protein')
    const plateau = ask('Varför står min vikt still?')
    expect(plateau.route.entry.id).toBe('coach.weight-trend')
    expect(plateau.explained.answer).toMatch(/platå|flera veckor/)
    expect(plateau.explained.answer).not.toMatch(/\d+(?:[.,]\d+)?\s*kg/i)
  })

  it('keeps a short setback and a restart on local coach knowledge', () => {
    const gain = ask('Jag har gått upp lite den här veckan, är allt förstört?')
    expect(gain.route.entry.id).toBe('coach.change-over-time')
    expect(gain.explained.answer).toMatch(/inte att arbetet är förstört/)
    const restart = ask('Jag missade några dagar, hur kommer jag igång igen?')
    expect(restart.route.entry.id).toBe('coach.motivation')
    expect(restart.explained.source).toBe('local')
  })

  it('answers meals, activity, and weekly focus from principles', () => {
    expect(ask('Hur bygger jag en bra måltid?').route.entry.id).toBe('coach.meal-structure')
    expect(ask('Räcker en promenad som aktivitet?').route.entry.id).toBe('coach.activity')
    const focus = ask('Vad borde jag fokusera på den här veckan?')
    expect(focus.route.kind).toBe('local')
    expect(focus.route.entry.id).toBe('coach.weekly-focus')
  })

  it('refuses to invent a personal trend and uses an explicit fixture when one is given', () => {
    const missing = ask('Hur har min vikt utvecklats?')
    expect(missing.route.kind).toBe('context-gap')
    expect(missing.explained.answer).toMatch(/saknas/)
    expect(missing.explained.answer).not.toMatch(/\d+(?:[.,]\d+)?\s*kg/i)
    const context = projectCoachContext({
      displayName: 'Ada',
      heightCm: 170,
      weightTrend: { changeKg: -0.4, direction: 'ned' },
    })
    expect(context).toEqual({ weightTrend: { changeKg: -0.4, direction: 'ned' } })
    const personal = ask('Har min vikt gått åt rätt håll?', { context })
    expect(personal.route.kind).toBe('local')
    expect(personal.explained.answer).toMatch(/-0\.4 kg/)
    expect(personal.explained.answer).toMatch(/ned/)
    expect(personal.explained.answer).not.toMatch(/Ada|170/)
  })

  it('uses the previous coach topic for a follow-up and does not guess without one', () => {
    const route = routeCoachQuestion({
      languageCode: 'sv',
      messages: [
        { content: 'Jag vill få i mig mer protein.', role: 'user' },
        { content: 'Protein i måltiden gör den mer mättande.', role: 'assistant' },
        { content: 'Ge mig några enklare exempel.', role: 'user' },
      ],
    })
    const explained = explainCoachRoute(route)
    expect(route.entry.id).toBe('coach.protein')
    expect(route.examples).toBe(true)
    expect(explained.answer).toMatch(/Ägg|Bönor/)
    expect(ask('Ge mig några enklare exempel.').route.kind).toBe('gap')
    const simpler = routeCoachQuestion({
      languageCode: 'sv',
      messages: [
        { content: 'Hur fungerar vikttrend?', role: 'user' },
        { content: 'En vikttrend läses över flera veckor.', role: 'assistant' },
        { content: 'Kan du förklara det enklare?', role: 'user' },
      ],
    })
    expect(simpler.entry.id).toBe('coach.weight-trend')
    expect(simpler.kind).toBe('local')
  })

  it('keeps help navigation out of coach knowledge and coach context out of help', () => {
    expect(classifyDomainIntent('Var hittar jag viktgrafen?')).toMatchObject({ domain: 'help', handoff: false, performed: false })
    expect(classifyDomainIntent('Öppna Min resa')).toMatchObject({ domain: 'help', handoff: false, performed: false })
    expect(classifyDomainIntent('Varför har min vikttrend planat ut?')).toMatchObject({ domain: 'coach', handoff: false, performed: false })
    expect(classifyDomainIntent('Vad borde jag fokusera på den här veckan?').domain).toBe('coach')
    expect(searchCoachKnowledge('Var hittar jag viktgrafen?')).toEqual([])
    expect(searchCoachKnowledge('Hur öppnar jag Min resa?')).toEqual([])
    const coachHits = searchCoachKnowledge('Varför har min vikttrend planat ut?')
    expect(coachHits.some((entry) => entry.id === 'coach.weight-trend')).toBe(true)
    expect(coachHits.every((entry) => entry.id.startsWith('coach.'))).toBe(true)
    expect(helpDomain.retrieve('Varför står min vikt still?').some((entry) => entry.id.startsWith('coach.'))).toBe(false)
    expect(helpDomain.context()).toEqual({ data: null, ok: true, personal: false })
    const helpService = readFileSync(new URL('../../../api/_shared/aiHelp/service.js', import.meta.url), 'utf8')
    expect(helpService).not.toMatch(/coachKnowledge|contextProvider|projectCoachContext/)
    expect(ask('Var hittar jag viktgrafen?').route).toMatchObject({ handoff: false, kind: 'other-domain', performed: false })
    expect(ask('Öppna Min resa').explained.answer).toBe('')
  })

  it('handles an unknown topic and a medical question without a diagnosis', () => {
    expect(ask('Hur odlar jag en drake?').route.kind).toBe('gap')
    const medical = ask('Har jag diabetes?')
    expect(medical.route.kind).toBe('safety')
    expect(medical.explained.answer).toMatch(/vården/)
    expect(medical.explained.answer).not.toMatch(/du har diabetes/i)
    expect(createFixtureCoachContext({ goal: 'maintain', weightKg: 80 })()).toEqual({ goal: 'maintain' })
  })
})
