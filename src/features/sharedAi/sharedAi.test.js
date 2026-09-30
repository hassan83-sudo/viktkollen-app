import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { answerAiHelpQuestion } from '../../../api/_shared/aiHelp/service.js'
import { routeHelpQuestion } from '../aiHelp/helpRouter.js'
import { knowledgeCatalog } from '../aiHelp/knowledgeCatalog.js'
import { coachDomain } from './coachDomain.js'
import { COACH_TOOL_ALLOWLIST, FUTURE_COACH_CONTEXT_FIELDS, HELP_TOOL_ALLOWLIST, defineAiDomain } from './domainContract.js'
import { classifyDomainIntent } from './domainIntent.js'
import { helpDomain } from './helpDomain.js'

const helpQuestions = [
  ['Hur öppnar jag Min resa?', 'navigation.journey', 'local'],
  ['Var ser jag viktkurvan?', 'feature.weight-history', 'local'],
  ['Var finns viktgraff?', 'feature.weight-history', 'local'],
  ['Var finns teleporten?', null, 'gap'],
]

describe('shared AI foundation', () => {
  it('keeps AI Help routing on the shared help domain without changing answers', () => {
    for (const [question, id, kind] of helpQuestions) {
      const input = { languageCode: 'sv', messages: [{ content: question, role: 'user' }] }
      const direct = routeHelpQuestion(input)
      const shared = helpDomain.route(input)
      expect(shared.kind, question).toBe(kind)
      expect(shared.kind).toBe(direct.kind)
      if (id) expect(shared.entry.id).toBe(id)
    }
    const follow = helpDomain.route({
      languageCode: 'sv',
      messages: [{ content: 'Kan du öppna den?', role: 'user' }],
      pinnedIds: ['navigation.journey'],
    })
    expect(follow).toMatchObject({
      entry: { id: 'navigation.journey', sectionId: 'journey' },
      kind: 'local',
    })
    expect(helpDomain.toolAllowed('open-section')).toBe(true)
    expect(helpDomain.toolAllowed('delete-account')).toBe(false)
    expect(helpDomain.allowedTools).toEqual(['open-section'])
  })

  it('does not give the coach domain help knowledge, help tools, or personal data', () => {
    expect(coachDomain.retrieve('Var ser jag min viktgraf?')).toEqual([])
    expect(coachDomain.retrieve('Hur öppnar jag Min resa?')).toEqual([])
    expect(helpDomain.retrieve('Var ser jag min viktgraf?').some((entry) => entry.id === 'feature.weight-history')).toBe(true)
    expect(coachDomain.allowedTools).toEqual([])
    expect(coachDomain.toolAllowed('open-section')).toBe(false)
    expect(HELP_TOOL_ALLOWLIST).toEqual(['open-section'])
    expect(COACH_TOOL_ALLOWLIST).not.toEqual(expect.arrayContaining(HELP_TOOL_ALLOWLIST))
    expect(coachDomain.context()).toEqual({
      data: null,
      ok: false,
      personal: false,
      reason: 'context_provider_required',
    })
    expect(coachDomain.context(() => ({ goal: 'maintain' }))).toEqual({
      data: { goal: 'maintain' },
      ok: true,
      personal: true,
      reason: 'explicit_provider',
    })
    expect(helpDomain.context().personal).toBe(false)
    const coachSource = readFileSync(new URL('./coachDomain.js', import.meta.url), 'utf8')
    expect(coachSource).not.toMatch(/knowledgeCatalog|userDataRepository|supabase|select /)
    expect(coachSource).not.toContain(knowledgeCatalog[0].summary)
    expect(FUTURE_COACH_CONTEXT_FIELDS).toEqual([
      'activity',
      'goal',
      'habits',
      'meals',
      'preferences',
      'protein',
      'weightTrend',
    ])
  })

  it('classifies a cross-domain question without performing a handoff', () => {
    expect(classifyDomainIntent('Var hittar jag viktgrafen?')).toEqual({
      domain: 'help',
      handoff: false,
      performed: false,
    })
    expect(classifyDomainIntent('Varför har min vikttrend planat ut?')).toEqual({
      domain: 'coach',
      handoff: false,
      performed: false,
    })
    expect(classifyDomainIntent('Varför står min vikt still?').domain).toBe('coach')
    expect(classifyDomainIntent('Vad kostar det?')).toMatchObject({ domain: 'help', handoff: false, performed: false })
    expect(classifyDomainIntent('')).toMatchObject({ domain: 'unclear', handoff: false, performed: false })
  })

  it('keeps one shared cost guard and separate tool lists', () => {
    const service = readFileSync(new URL('../../../api/_shared/aiHelp/service.js', import.meta.url), 'utf8')
    const foundation = [
      'domainContract.js',
      'coachDomain.js',
      'helpDomain.js',
      'domainIntent.js',
    ].map((name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')).join('\n')
    expect(service).toContain("from './costGuard.js'")
    expect(service).not.toContain('classifyDomainIntent')
    expect(helpDomain.costGuard).toBe('shared')
    expect(coachDomain.costGuard).toBe('shared')
    expect(foundation).not.toMatch(/reserve_model_call|AI_HELP_BUDGET_SEK|0\.25/)
    expect(() => defineAiDomain({ id: 'billing', instructions() {}, retrieve() {}, route() {} })).toThrow('invalid_domain')
  })

  it('still answers a local help question when the model budget is closed', async () => {
    const fetchImpl = vi.fn()
    const result = await answerAiHelpQuestion({
      body: { language: 'sv', messages: [{ content: 'Var ser jag hur vikten förändrats?', role: 'user' }] },
      costStore: { reserve: vi.fn() },
      env: { AI_HELP_BUDGET_SEK: '0', OPENAI_API_KEY: 'test-key' },
      fetchImpl,
      userId: 'user-shared-local',
    })
    expect(result.source).toBe('local')
    expect(result.featureIds).toEqual(['feature.weight-history'])
    expect(result.tool).toMatchObject({ name: 'open-section', sectionId: 'progress' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
