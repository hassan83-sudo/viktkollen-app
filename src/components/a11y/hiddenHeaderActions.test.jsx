/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import OverviewDashboard from '../app/OverviewDashboard.jsx'

// A11Y-8L (8H A2): one switch controls both the look and the semantics of
// the Home header actions. Tab order, focus visibility and the accessibility
// tree are proven in Chromium (tests/a11y/hidden-controls.spec.js).

function renderHome(props = {}) {
  return render(
    <OverviewDashboard
      adaptiveCoachFeedback={{}}
      calorieGoal={2200}
      caloriesToday={1840}
      checkIn={{}}
      currentWeight={78}
      featureFlags={{ socialUi: true }}
      foods={[]}
      goalsHabits={{}}
      healthScore={81}
      healthSnapshot={{ date: '2026-08-11', weight: { current: 78, dailyWeights: [] } }}
      isAuthenticated
      meals={[]}
      nutritionGoals={{}}
      onAddMeal={vi.fn()}
      onEditProfile={vi.fn()}
      onLogWeight={vi.fn()}
      onNavigateSection={vi.fn()}
      onScanFood={vi.fn()}
      profile={{ name: 'Test Person' }}
      proteinGoal={1}
      proteinToday={1}
      reminderState={{ reminders: [] }}
      selectedDate="2026-08-11"
      syncStatus={{}}
      weights={[]}
      {...props}
    />,
  )
}

function headerActions() {
  return document.querySelector('.overview-header-actions')
}

describe('Home header actions (A11Y-8L)', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await i18n.changeLanguage('sv')
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('are visually hidden AND inert by default (the current Home design)', () => {
    renderHome()
    const container = headerActions()
    expect(container.classList.contains('sr-only')).toBe(true)
    expect(container.hasAttribute('inert')).toBe(true)
    // The controls and their function still exist; they are only inert.
    expect(container.querySelector('button[aria-label="Visa smarta notiser"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Lägg till profilbild"]')).not.toBeNull()
    // No aria-hidden on a container with focusable descendants.
    expect(container.hasAttribute('aria-hidden')).toBe(false)
  })

  it('become ordinary named controls when shown, and still work', () => {
    const onNavigateSection = vi.fn()
    const pickFile = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    renderHome({ onNavigateSection, showHeaderActions: true })
    const container = headerActions()
    expect(container.classList.contains('sr-only')).toBe(false)
    expect(container.hasAttribute('inert')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Visa smarta notiser' }))
    expect(onNavigateSection).toHaveBeenCalledWith('notices')

    fireEvent.click(screen.getByRole('button', { name: 'Lägg till profilbild' }))
    expect(pickFile).toHaveBeenCalledTimes(1)
  })
})
