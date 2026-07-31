import { describe, expect, it } from 'vitest'
import { formatKg } from './healthCalculations.js'
import {
  clampVisualPercent,
  formatCalories,
  formatDecimal,
  formatGrams,
  formatPercentage,
  formatSleepDuration,
  formatSteps,
  formatWeight,
  formatWeightChange,
  normalizeNegativeZero,
} from './healthFormatting.js'
import { formatProgressChange } from './progress/progressAnalytics.js'

describe('central health formatting', () => {
  it('formats weight with Swedish decimal comma', () => {
    expect(formatWeight(89.6)).toBe('89,6 kg')
    expect(formatKg(89.6)).toBe('89,6 kg')
  })

  it('removes floating point artifacts', () => {
    expect(formatDecimal(2.199999999, { decimals: 1 })).toBe('2,2')
    expect(formatWeightChange(0.3000000000000007)).toBe('0,3 kg')
  })

  it('formats negative and positive weight changes consistently', () => {
    expect(formatWeightChange(-2.2)).toBe('-2,2 kg')
    expect(formatWeightChange(0.5, { showPlus: true })).toBe('+0,5 kg')
  })

  it('normalizes negative zero values', () => {
    expect(normalizeNegativeZero(-0, 1)).toBe(0)
    expect(formatWeightChange(-0)).toBe('0 kg')
    expect(formatKg(-0.04)).toBe('0 kg')
  })

  it('formats percentages and keeps visual progress machine safe', () => {
    expect(formatPercentage(15.9, { maximumFractionDigits: 1 })).toBe('15,9 %')
    expect(formatPercentage(125, { maximumFractionDigits: 0 })).toBe('125 %')
    expect(clampVisualPercent(125)).toBe(100)
  })

  it('uses neutral fallbacks for invalid values', () => {
    ;[null, undefined, Number.NaN, Infinity].forEach((value) => {
      expect(formatWeight(value)).toBe('saknas')
      expect(formatPercentage(value)).toBe('Saknas')
      expect(formatCalories(value)).toBe('Saknas')
      expect(formatGrams(value)).toBe('Saknas')
    })
  })

  it('formats steps as grouped whole numbers', () => {
    expect(formatSteps(10250)).toBe('10 250 steg')
    expect(formatSteps(10250.9)).toBe('10 251 steg')
  })

  it('formats sleep as hours and minutes', () => {
    expect(formatSleepDuration(7.5)).toBe('7 h 30 min')
    expect(formatSleepDuration(7)).toBe('7 h')
    expect(formatSleepDuration(null)).toBe('Saknas')
  })

  it('formats calories and grams without artifacts', () => {
    expect(formatCalories(499.7)).toBe('500 kcal')
    expect(formatCalories(10000)).toBe('10 000 kcal')
    expect(formatGrams(0.3000000000000007)).toBe('0,3 g')
    expect(formatGrams(108.4)).toBe('108 g')
  })

  it('keeps Progress Dashboard and AI-facing weight change text aligned', () => {
    expect(formatProgressChange(-2.199999999)).toBe('2,2 kg ned')
    expect(formatProgressChange(0.5)).toBe('0,5 kg upp')
  })
})
