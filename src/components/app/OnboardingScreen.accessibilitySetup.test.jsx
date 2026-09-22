/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import { createProfileForm } from '../../services/profileService.js'
import { accessibilityPreferencesKey } from '../../services/accessibilityPreferences.js'
import OnboardingScreen from './OnboardingScreen.jsx'

function renderOnboarding(overrides = {}) {
  return render(
    <OnboardingScreen
      activityOptions={[{ label: 'Måttlig', value: 'moderate' }]}
      goalOptions={[{ label: 'Gå ner i vikt', value: 'loss' }]}
      onCancel={null}
      onProfileFormChange={vi.fn()}
      onSubmit={vi.fn((event) => event.preventDefault())}
      profileCompleteness={{}}
      profileError=""
      profileForm={createProfileForm({})}
      {...overrides}
    />,
  )
}

// A11Y-7C: the optional accessibility step inside onboarding. Never blocks
// the real profile form, is collapsed by default, and uses the exact same
// AccessibilitySetup component as Mer -> Tillgänglighet & hjälpmedel.
describe('OnboardingScreen accessibility setup entry (A11Y-7C)', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await i18n.changeLanguage('sv')
  })

  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  // jsdom does not implement the browser's default <details> stylesheet, so
  // collapsed content stays DOM-queryable even though real browsers hide it
  // visually/from the accessibility tree. These tests assert on the
  // <details> element's own open state (a real DOM property, unaffected by
  // that jsdom gap) instead of relying on content visibility.
  function getDetails() {
    return document.querySelector('details.onboarding-accessibility-setup')
  }

  it('is optional and collapsed by default, never blocking the profile form', () => {
    renderOnboarding()

    expect(screen.getByRole('button', { name: 'Spara och fortsätt' })).toBeTruthy()
    expect(getDetails().open).toBe(false)
  })

  it('opens the accessibility setup from its summary trigger', () => {
    renderOnboarding()

    fireEvent.click(screen.getByText('Anpassa Viktkollen'))

    expect(getDetails().open).toBe(true)
    expect(screen.getByRole('button', { name: 'Tydligare kontrast' })).toBeTruthy()
  })

  it('lets the user skip without affecting the profile form', () => {
    const onProfileFormChange = vi.fn()
    renderOnboarding({ onProfileFormChange })

    fireEvent.click(screen.getByText('Anpassa Viktkollen'))
    fireEvent.click(screen.getByRole('button', { name: 'Inte nu' }))

    expect(getDetails().open).toBe(false)
    expect(onProfileFormChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Spara och fortsätt' })).toBeTruthy()
  })

  it('applies a real preference change through the shared local store and can be finished', () => {
    renderOnboarding()

    fireEvent.click(screen.getByText('Anpassa Viktkollen'))
    fireEvent.click(screen.getByRole('button', { name: 'Stor text' }))
    expect(window.localStorage.getItem(accessibilityPreferencesKey)).toContain('"textSize":"large"')

    fireEvent.click(screen.getByRole('button', { name: 'Klart' }))
    expect(getDetails().open).toBe(false)
    // The choice made stays saved even after the panel collapses.
    expect(window.localStorage.getItem(accessibilityPreferencesKey)).toContain('"textSize":"large"')
  })
})
