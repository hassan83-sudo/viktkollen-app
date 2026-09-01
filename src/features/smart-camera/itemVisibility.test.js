import { describe, expect, it } from 'vitest'
import {
  applyItemStatuses,
  assertNoMissingClaim,
  compareChecklistToVisibleItems,
  formatUncertainItemMessage,
  formatUnseenItemMessage,
} from './itemVisibility.js'
import {
  forgottenCheckGuidancePhrases,
  getForgottenCheckGuidance,
  getNextForgottenCheckGuidanceIndex,
  summarizeForgottenCheckResult,
} from './forgottenCheckGuide.js'
import { checkMeSteps, getNextCheckMeIndex } from './checkMeGuide.js'
import { lastCheckSteps } from './lastCheckGuide.js'
import { buildOutfitWeatherFacts } from './outfitAdvice.js'

describe('itemVisibility', () => {
  it('never claims an item is forgotten just because it is not seen', () => {
    const items = [
      { done: true, id: 'phone', label: 'Mobil' },
      { done: false, id: 'tissues', label: 'Servetter' },
    ]
    const result = compareChecklistToVisibleItems(items)
    expect(result.seen.map((item) => item.label)).toEqual(['Mobil'])
    expect(result.check[0].message).toBe(formatUnseenItemMessage('Servetter'))
    expect(result.check[0].message).toContain('Kontrollera att du har')
    expect(assertNoMissingClaim(result.check[0].message)).toBe(true)
    expect(result.check[0].message).not.toContain('Du har glömt')
  })
})

describe('checkMeGuide', () => {
  it('guides front, turn right, back and turn left', () => {
    expect(checkMeSteps.map((step) => step.id)).toEqual(['front', 'turn-right', 'back', 'turn-left'])
    expect(getNextCheckMeIndex(0)).toBe(1)
    expect(getNextCheckMeIndex(3)).toBeNull()
    expect(lastCheckSteps.map((step) => step.id)).toContain('weather')
  })
})

describe('forgottenCheckGuide', () => {
  it('cycles guidance phrases and never claims an unconfirmed item is definitely forgotten', () => {
    expect(getForgottenCheckGuidance(0).phrase).toBe(forgottenCheckGuidancePhrases[0])
    expect(getNextForgottenCheckGuidanceIndex(forgottenCheckGuidancePhrases.length - 1)).toBe(0)
    expect(getForgottenCheckGuidance(-1).index).toBe(forgottenCheckGuidancePhrases.length - 1)

    const items = [
      { done: false, id: 'phone', label: 'Mobil' },
      { done: false, id: 'keys', label: 'Nycklar' },
    ]
    const result = summarizeForgottenCheckResult(items, ['phone'])
    expect(result.summary).toBe('Jag kan bekräfta 1 av 2 saker.')
    expect(result.seen.map((item) => item.label)).toEqual(['Mobil'])
    expect(result.check.map((item) => item.label)).toEqual(['Nycklar'])
    expect(assertNoMissingClaim(result.check[0].message)).toBe(true)
    expect(result.check[0].message).not.toContain('Du har glömt')

    expect(summarizeForgottenCheckResult([], []).summary).toMatch(/tom/)
  })
})

describe('outfitAdvice', () => {
  it('uses only live weather fields and does not invent UV or location rooms', () => {
    const empty = buildOutfitWeatherFacts({ hasLiveWeather: false })
    expect(empty.available).toBe(false)
    expect(empty.note).toMatch(/väder/)

    const live = buildOutfitWeatherFacts({
      condition: 'Halvklart',
      feelsLikeC: 9,
      hasLiveWeather: true,
      precipitationRiskPercent: 10,
      sunriseLabel: '05:47',
      sunset: '2026-08-25T20:28:00',
      sunsetLabel: '20:28',
      temperatureC: 12,
      windSpeedMs: 8,
    })
    expect(live.facts.join(' ')).toContain('12°C')
    expect(live.facts.join(' ')).toContain('Känns som 9°C')
    expect(live.facts.join(' ')).toContain('Vind 8 m/s')
    expect(live.lines.join(' ')).toMatch(/jacka|blåser/i)
    expect(live.facts.join(' ')).not.toMatch(/UV/i)
  })
})

describe('itemVisibility - applyItemStatuses (AI + manual merge, for the optional remote check)', () => {
  const items = [
    { done: false, id: 'phone', label: 'Mobil' },
    { done: false, id: 'keys', label: 'Nycklar' },
    { done: false, id: 'wallet', label: 'Plånbok' },
    { done: false, id: 'headphones', label: 'Hörlurar' },
    { done: false, id: 'glasses', label: 'Glasögon' },
  ]

  it('classifies identified/uncertain/not_confirmed from AI statuses when nothing was shown manually', () => {
    const statusesById = {
      glasses: 'identified',
      headphones: 'uncertain',
      keys: 'not_confirmed',
      phone: 'identified',
      wallet: 'identified',
    }
    const result = applyItemStatuses(items, { statusesById, visibleIds: [] })

    expect(result.seen.map((item) => item.id).sort()).toEqual(['glasses', 'phone', 'wallet'])
    expect(result.uncertain.map((item) => item.id)).toEqual(['headphones'])
    expect(result.check.map((item) => item.id)).toEqual(['keys'])
  })

  it('lets a manual "visad" tap always win as identified, even if the AI said not_confirmed for the same item', () => {
    const statusesById = { phone: 'not_confirmed' }
    const result = applyItemStatuses(items, { statusesById, visibleIds: ['phone'] })

    expect(result.seen.map((item) => item.id)).toContain('phone')
    expect(result.uncertain.map((item) => item.id)).not.toContain('phone')
    expect(result.check.map((item) => item.id)).not.toContain('phone')
  })

  it('defaults an item with no AI status and no manual mark to not_confirmed, never identified', () => {
    const result = applyItemStatuses(items, { statusesById: { phone: 'identified' }, visibleIds: [] })
    const unresolved = result.check.map((item) => item.id)

    expect(unresolved).toEqual(expect.arrayContaining(['keys', 'wallet', 'headphones', 'glasses']))
  })

  it('defaults an unknown/garbage AI status value to not_confirmed rather than guessing identified', () => {
    const result = applyItemStatuses(items, { statusesById: { phone: 'something-the-model-made-up' }, visibleIds: [] })

    expect(result.seen.map((item) => item.id)).not.toContain('phone')
    expect(result.check.map((item) => item.id)).toContain('phone')
  })

  it('every uncertain and not_confirmed message passes assertNoMissingClaim and never says "glömt"', () => {
    const statusesById = { headphones: 'uncertain', keys: 'not_confirmed' }
    const result = applyItemStatuses(items, { statusesById, visibleIds: [] })

    expect(result.uncertain[0].message).toBe(formatUncertainItemMessage('Hörlurar'))
    expect(assertNoMissingClaim(result.uncertain[0].message)).toBe(true)
    expect(result.uncertain[0].message).not.toContain('glömt')

    const keysCheckMessage = result.check.find((item) => item.id === 'keys').message
    expect(assertNoMissingClaim(keysCheckMessage)).toBe(true)
    expect(keysCheckMessage).not.toContain('glömt')
  })
})

describe('forgottenCheckGuide - summarizeForgottenCheckResult with AI statuses (3rd arg)', () => {
  const items = [
    { done: false, id: 'phone', label: 'Mobil' },
    { done: false, id: 'keys', label: 'Nycklar' },
    { done: false, id: 'wallet', label: 'Plånbok' },
    { done: false, id: 'headphones', label: 'Hörlurar' },
    { done: false, id: 'glasses', label: 'Glasögon' },
  ]

  it('matches the task example: mobil/plånbok/glasögon identified, nycklar/hörlurar unconfirmed', () => {
    const aiStatusesById = {
      glasses: 'identified',
      headphones: 'not_confirmed',
      keys: 'not_confirmed',
      phone: 'identified',
      wallet: 'identified',
    }
    const result = summarizeForgottenCheckResult(items, [], aiStatusesById)

    expect(result.seen.map((item) => item.label).sort()).toEqual(['Glasögon', 'Mobil', 'Plånbok'])
    const unresolvedLabels = [...result.uncertain, ...result.check].map((item) => item.label).sort()
    expect(unresolvedLabels).toEqual(['Hörlurar', 'Nycklar'])
    ;[...result.uncertain, ...result.check].forEach((item) => {
      expect(assertNoMissingClaim(item.message)).toBe(true)
      expect(item.message).not.toContain('Du har glömt')
    })
  })

  it('stays backward-compatible: omitting the 3rd argument behaves exactly like the manual-only 2-arg call', () => {
    const withoutAi = summarizeForgottenCheckResult(items, ['phone'])
    const withNullAi = summarizeForgottenCheckResult(items, ['phone'], null)

    expect(withNullAi.seen.map((item) => item.id)).toEqual(withoutAi.seen.map((item) => item.id))
    expect(withNullAi.check.map((item) => item.id)).toEqual(withoutAi.check.map((item) => item.id))
  })

  it('manual confirmation always overrides an AI not_confirmed verdict for the same item', () => {
    const result = summarizeForgottenCheckResult(items, ['keys'], { keys: 'not_confirmed' })

    expect(result.seen.map((item) => item.id)).toContain('keys')
  })
})
