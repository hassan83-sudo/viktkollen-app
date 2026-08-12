import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import OverviewDashboard from './OverviewDashboard.jsx'

function renderOverview(overrides = {}) {
  return renderToStaticMarkup(
    <OverviewDashboard
      adaptiveCoachFeedback={{}}
      calorieGoal={2200}
      caloriesToday={1840}
      checkIn={{ steps: 13956 }}
      currentWeight={78.4}
      email="hassan@example.com"
      foods={[]}
      goalsHabits={{}}
      healthScore={81}
      healthSnapshot={{
        date: '2026-08-11',
        weight: { current: 78.4, dailyWeights: [{ date: '2026-08-11', value: 78.4 }] },
      }}
      meals={[]}
      nutritionGoals={{ calories: 2200, protein: 135 }}
      onAddMeal={vi.fn()}
      onEditProfile={vi.fn()}
      onLogWeight={vi.fn()}
      onScanFood={vi.fn()}
      profile={{ name: 'Hassan Kayed', goalWeight: 74 }}
      progressInsights={[
        {
          basis: 'Senaste 30 dagarna.',
          text: 'Vikttrenden går nedåt.',
          type: 'weight-down',
        },
      ]}
      proteinGoal={135}
      proteinToday={112}
      reminderState={{ reminders: [] }}
      selectedDate="2026-08-11"
      syncStatus={{}}
      weeklyWeightChange={-0.4}
      weights={[{ date: '2026-08-11', value: 78.4 }]}
      {...overrides}
    />,
  )
}

describe('OverviewDashboard', () => {
  it('renders the overview app header with date and avatar initials', () => {
    const markup = renderOverview()

    expect(markup).toContain('<h1>Översikt</h1>')
    expect(markup).toContain('tisdag 11 aug.')
    expect(markup).toContain('aria-label="Öppna profilinställningar"')
    expect(markup).toContain('HK')
  })

  it('renders real stat values without production placeholders', () => {
    const markup = renderOverview().replaceAll('\u00a0', ' ')

    expect(markup).toContain('13 956')
    expect(markup).toContain('112 g')
    expect(markup).toContain('1 840 kcal')
    expect(markup).not.toContain('placeholder')
  })

  it('uses a textual fallback for the activity ring value', () => {
    const markup = renderOverview()

    expect(markup).toContain('role="progressbar"')
    expect(markup).toContain('aria-label="Health Score: 81 / 100"')
  })

  it('keeps quick actions available as compact buttons', () => {
    const markup = renderOverview()

    expect(markup).toContain('Logga vikt')
    expect(markup).toContain('Lägg till måltid')
    expect(markup).toContain('AI Coach')
  })

  it('shows an empty state instead of fake stats when data is missing', () => {
    const markup = renderOverview({
      calorieGoal: undefined,
      caloriesToday: undefined,
      checkIn: {},
      currentWeight: undefined,
      healthScore: undefined,
      proteinGoal: undefined,
      proteinToday: undefined,
      progressInsights: [],
    })

    expect(markup).toContain('Inga värden loggade ännu')
    expect(markup).toContain('Insikter visas när mer historik finns.')
  })
})
