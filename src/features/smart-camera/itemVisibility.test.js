import { describe, expect, it } from 'vitest'
import { assertNoMissingClaim, compareChecklistToVisibleItems, formatUnseenItemMessage } from './itemVisibility.js'
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
