import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const hubSource = readFileSync(new URL('./AccessibilityHub.jsx', import.meta.url), 'utf8')
const onboardingSource = readFileSync(new URL('../app/OnboardingScreen.jsx', import.meta.url), 'utf8')

// A11Y-7C: proves both entry points render the exact same AccessibilitySetup
// component (no second implementation), following the same source-text
// convention already used for App.jsx wiring checks.
describe('AccessibilitySetup shared component (A11Y-7C)', () => {
  it('is imported from the same module by both entry points', () => {
    expect(hubSource).toContain("import AccessibilitySetup from './AccessibilitySetup.jsx'")
    expect(onboardingSource).toContain("import AccessibilitySetup from '../more/AccessibilitySetup.jsx'")
  })

  it('is rendered, not reimplemented, by both entry points', () => {
    expect(hubSource).toContain('<AccessibilitySetup onFinish={returnToAccessibilityHub} />')
    expect(onboardingSource).toContain('<AccessibilitySetup')
    expect(onboardingSource).toContain('showSkip')
    expect(onboardingSource).toContain('onFinish={closeAccessibilitySetup}')
    expect(onboardingSource).toContain('onSkip={closeAccessibilitySetup}')
  })

  it('the hub entry point never asks a diagnosis question and never blocks account use', () => {
    expect(hubSource).not.toMatch(/diagnos/i)
    expect(onboardingSource).not.toMatch(/diagnos/i)
  })
})
