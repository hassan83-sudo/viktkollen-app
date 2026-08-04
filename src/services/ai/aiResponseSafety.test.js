import { describe, expect, it } from 'vitest'
import {
  makeRuleBasedFallbackResult,
  validateAiCoachSafety,
} from './aiResponseSafety.js'

describe('aiResponseSafety', () => {
  it('blocks unsafe Swedish and English advice', () => {
    expect(validateAiCoachSafety({ summary: 'Hoppa över middag för snabb viktminskning.' }).blocked).toBe(true)
    expect(validateAiCoachSafety({ summary: 'Stop taking medication and train every day without rest.' }).blocked).toBe(true)
  })

  it('blocks HTML and unknown action types', () => {
    const result = validateAiCoachSafety({
      recommendations: [{ suggestedActionType: 'script', title: '<script>x</script>' }],
    })

    expect(result.blocked).toBe(true)
    expect(result.errors).toContain('html')
    expect(result.errors).toContain('unknownAction')
  })

  it('allows neutral advice and creates rule-based fallback', () => {
    expect(validateAiCoachSafety({ summary: 'Lägg till protein och grönsaker i nästa måltid.' }).ok).toBe(true)
    expect(makeRuleBasedFallbackResult({ recommendations: [{ id: 'r1' }], summary: { todayFocus: 'Fokus' } }).providerType).toBe('ruleBased')
  })
})
