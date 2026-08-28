/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import OverviewDashboard from './OverviewDashboard.jsx'

function renderOverview(overrides = {}) {
  return render(
    <OverviewDashboard
      adaptiveCoachFeedback={{}}
      calorieGoal={2200}
      caloriesToday={1840}
      checkIn={{ steps: 13956 }}
      currentWeight={78.4}
      email="hassan@example.com"
      featureFlags={{ socialUi: true, socialLive: false }}
      foods={[]}
      goalsHabits={{}}
      healthScore={81}
      healthSnapshot={{
        date: '2026-08-11',
        weight: { current: 78.4, dailyWeights: [] },
      }}
      isAuthenticated
      meals={[]}
      nutritionGoals={{ calories: 2200, protein: 135 }}
      onAddMeal={vi.fn()}
      onEditProfile={vi.fn()}
      onLogWeight={vi.fn()}
      onNavigateSection={vi.fn()}
      onScanFood={vi.fn()}
      profile={{ name: 'Hassan Kayed', goalWeight: 74 }}
      proteinGoal={135}
      proteinToday={112}
      reminderState={{ reminders: [] }}
      selectedDate="2026-08-11"
      syncStatus={{}}
      weights={[]}
      {...overrides}
    />,
  )
}

describe('OverviewDashboard interactions', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sv')
  })

  afterEach(() => cleanup())

  it('opens Wellbeing from the Home card', () => {
    const onOpenWellbeing = vi.fn()
    renderOverview({ onOpenWellbeing })

    fireEvent.click(screen.getByRole('button', { name: 'Öppna Må bra' }))

    expect(onOpenWellbeing).toHaveBeenCalledTimes(1)
  })

  it('opens the existing social stage from the compact Home chat row', () => {
    renderOverview()

    fireEvent.click(screen.getByRole('button', { name: 'Öppna chatten' }))

    expect(screen.getByRole('dialog', { name: 'Vänner' })).toBeTruthy()
    expect(screen.getAllByText('Chatten är inte ansluten ännu. Ingen fejkdata visas.').length).toBeGreaterThanOrEqual(1)
  })
})
