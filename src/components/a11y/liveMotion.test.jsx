/* @vitest-environment jsdom */
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import { readAccessibilityPreferences, saveAccessibilityPreferences } from '../../services/accessibilityPreferences.js'
import OverviewDashboard from '../app/OverviewDashboard.jsx'

// A11Y-8J: Viktkollen Live timer hygiene and live-region semantics (jsdom).
// Rotation timing and real announcements are proven in Chromium
// (tests/a11y/live-motion.spec.js).

const ROTATION_MS = 10_000

function renderHome() {
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
      profile={{ name: 'Test' }}
      proteinGoal={1}
      proteinToday={1}
      reminderState={{ reminders: [] }}
      selectedDate="2026-08-11"
      syncStatus={{}}
      weights={[]}
    />,
  )
}

// Tracks the currently active 10 s rotation intervals.
function trackRotationTimers() {
  const active = new Set()
  const realSet = window.setInterval
  const realClear = window.clearInterval
  vi.spyOn(window, 'setInterval').mockImplementation((callback, delay, ...args) => {
    const id = realSet(callback, delay, ...args)
    if (delay === ROTATION_MS) active.add(id)
    return id
  })
  vi.spyOn(window, 'clearInterval').mockImplementation((id) => {
    active.delete(id)
    return realClear(id)
  })
  return active
}

function setReduceMotion(value) {
  act(() => {
    saveAccessibilityPreferences({ ...readAccessibilityPreferences().preferences, reduceMotion: value })
  })
}

describe('Viktkollen Live and reduced motion (A11Y-8J)', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await i18n.changeLanguage('sv')
    window.matchMedia = vi.fn(() => ({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() }))
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('the rotating card is not a live region; one empty status is used for manual changes', () => {
    renderHome()
    const live = document.getElementById('viktkollen-live')
    expect(live.querySelector('.smart-feed-active-card').getAttribute('aria-live')).toBeNull()
    expect(live.querySelectorAll('[aria-live]')).toHaveLength(0)
    const status = within(live).getByRole('status')
    expect(status.textContent).toBe('')
    act(() => { within(live).getAllByRole('button', { name: 'Visa nästa feed-kort' })[0].click() })
    expect(status.textContent).toContain(live.querySelector('.smart-feed-active-card strong').textContent)
  })

  it('one rotation timer normally, none with "Minska rörelse", and cleaned up on unmount', () => {
    const active = trackRotationTimers()
    const { unmount } = renderHome()
    expect(active.size).toBe(1)
    unmount()
    expect(active.size).toBe(0)
  })

  it('toggling the app setting during the session stops and restarts a single timer', () => {
    const active = trackRotationTimers()
    renderHome()
    expect(active.size).toBe(1)
    setReduceMotion(true)
    expect(active.size).toBe(0)
    expect(screen.getByRole('button', { name: 'Spela Viktkollen Live' })).toBeTruthy()
    setReduceMotion(false)
    expect(active.size).toBe(1)
    setReduceMotion(true)
    setReduceMotion(false)
    expect(active.size).toBe(1)
  })

  it('starts without a rotation timer when "Minska rörelse" is already on', () => {
    saveAccessibilityPreferences({ ...readAccessibilityPreferences().preferences, reduceMotion: true })
    const active = trackRotationTimers()
    renderHome()
    expect(active.size).toBe(0)
  })
})
