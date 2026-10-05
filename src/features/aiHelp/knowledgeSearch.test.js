import { describe, expect, it } from 'vitest'
import { routeHelpQuestion } from './helpRouter.js'
import { knowledgeCatalog } from './knowledgeCatalog.js'
import { searchKnowledge, selectKnowledgeContext } from './knowledgeSearch.js'

describe('AI Help knowledge catalog', () => {
  it('uses stable ids and does not store prices or quotas', () => {
    const ids = knowledgeCatalog.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('settings.language')
    expect(ids).toContain('settings.plan')
    const text = JSON.stringify(knowledgeCatalog)
    expect(text).not.toMatch(/\b\d+\s*(kr|sek)\b/i)
    expect(text).not.toMatch(/"limit"\s*:/)
  })

  it('finds the language steps without a translated catalog', () => {
    const hits = searchKnowledge('Hur byter jag språk?')
    expect(hits[0].id).toBe('settings.language')
    expect(selectKnowledgeContext('语言')).toEqual([])
  })

  it('retrieves navigation, product areas, price questions and cancellation without storing terms', () => {
    expect(searchKnowledge('Hur öppnar jag Min resa?')[0].id).toBe('navigation.journey')
    expect(searchKnowledge('Hur öppnar jag Mer?')[0].id).toBe('navigation.more')
    expect(searchKnowledge('Var finns matscanning?').some((entry) => entry.id === 'more.nutrition')).toBe(true)
    expect(searchKnowledge('Var finns AI-Örat?').some((entry) => entry.id === 'feature.ai-ear')).toBe(true)
    const ear = knowledgeCatalog.find((entry) => entry.id === 'feature.ai-ear')
    expect(ear.summary).toMatch(/ingen ansluten melodiigenkänning/)
    expect(ear.summary).not.toMatch(/acrcloud|humming backend/i)
    expect(searchKnowledge('Vad kostar abonnemanget?')[0].id).toBe('settings.plan')
    expect(searchKnowledge('Hur säger jag upp abonnemanget?').some((entry) => entry.id === 'settings.plan')).toBe(true)
    const plan = knowledgeCatalog.find((entry) => entry.id === 'settings.plan')
    expect(plan.summary).toContain('kan inte ändra')
    expect(plan.summary).toContain('uppsägning')
  })

  it('answers clear Swedish feature questions locally', () => {
    const cases = [
      ['Hur öppnar jag Min resa?', 'navigation.journey'],
      ['Var finns min viktgraf?', 'feature.weight-history'],
      ['Hur fungerar abonnemangen?', 'settings.plan'],
      ['Hur hittar jag inställningarna?', 'more.settings'],
    ]
    for (const [question, id] of cases) {
      const route = routeHelpQuestion({ languageCode: 'sv', messages: [{ content: question, role: 'user' }] })
      expect(route.kind, question).toBe('local')
      expect(route.entry.id, question).toBe(id)
    }
  })

  it('matches free wording, synonyms and a small typo to verified features', () => {
    const cases = [
      ['Hur öppnar jag Min resa?', 'navigation.journey', 'local'],
      ['Var ser jag viktkurvan?', 'feature.weight-history', 'local'],
      ['Var ser jag hur vikten förändrats?', 'feature.weight-history', 'local'],
      ['Var finns viktgraff?', 'feature.weight-history', 'local'],
      ['Kan jag se bilder från tidigare?', 'feature.progress-photos', 'local'],
      ['Var ändrar jag mina uppgifter?', 'settings.profile', 'local'],
      ['Vad kostar det?', 'settings.plan', 'local'],
      ['Var finns teleporten?', null, 'gap'],
      ['Skriv en dikt om katten', null, 'out-of-scope'],
    ]
    for (const [question, id, kind] of cases) {
      const route = routeHelpQuestion({ languageCode: 'sv', messages: [{ content: question, role: 'user' }] })
      expect(route.kind, question).toBe(kind)
      if (id) expect(route.entry.id, question).toBe(id)
    }
  })

  it('uses the previous feature when the follow-up only says to open it', () => {
    const route = routeHelpQuestion({
      languageCode: 'sv',
      messages: [{ content: 'Kan du öppna den?', role: 'user' }],
      pinnedIds: ['navigation.journey'],
    })
    expect(route).toMatchObject({ kind: 'local', entry: { id: 'navigation.journey' } })
    expect(routeHelpQuestion({
      languageCode: 'sv',
      messages: [{ content: 'Kan du öppna den?', role: 'user' }],
    }).kind).toBe('gap')
  })

  it('sends a comparison to the model and keeps a navigation tool on the verified section', () => {
    const route = routeHelpQuestion({
      languageCode: 'sv',
      messages: [{ content: 'Kan du förklara skillnaden mellan Min resa och Framsteg?', role: 'user' }],
    })
    expect(route.kind).toBe('model')
    expect(route.entries.map((entry) => entry.id)).toEqual(expect.arrayContaining(['navigation.journey', 'more.progress']))
    const opened = routeHelpQuestion({
      languageCode: 'sv',
      messages: [{ content: 'Kan du öppna den?', role: 'user' }],
      pinnedIds: ['feature.weight-history'],
    })
    expect(opened.entry.sectionId).toBe('progress')
  })
})
