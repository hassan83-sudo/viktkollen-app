import { describe, expect, it } from 'vitest'
import { followUpsFor, loginGuidance, requestedLanguageSwitch, troubleshootingLine } from './launchGuidance.js'

describe('launch guidance', () => {
  it('explains login recovery without changing the account', () => {
    expect(loginGuidance('sv')).toContain('ändrar inte kontot')
    expect(loginGuidance('en')).toContain('Do not type the password')
    expect(loginGuidance('es')).toContain('No cambio la cuenta')
    expect(loginGuidance('ar')).toContain('لا أغيّر الحساب')
  })

  it('keeps troubleshooting read-only', () => {
    expect(troubleshootingLine('sv')).toContain('har ändrats')
    expect(troubleshootingLine('en')).toContain('No account, subscription or payment was changed')
  })

  it('offers follow-up questions for the current topic', () => {
    expect(followUpsFor('payment', 'sv')).toEqual([
      'Vad är mitt abonnemang?',
      'När slutar den här perioden?',
    ])
    expect(followUpsFor('unknown', 'en')).toHaveLength(2)
  })

  it('switches only an explicit language request', () => {
    expect(requestedLanguageSwitch('byt språk till engelska')).toBe('en')
    expect(requestedLanguageSwitch('switch language to arabic')).toBe('ar')
    expect(requestedLanguageSwitch('cambiar idioma a español')).toBe('es')
    expect(requestedLanguageSwitch('غير اللغة إلى السويدية')).toBe('sv')
    expect(requestedLanguageSwitch('mitt lösenord är hemligt')).toBeNull()
    expect(requestedLanguageSwitch('byt språk till tyska')).toBeNull()
  })
})
