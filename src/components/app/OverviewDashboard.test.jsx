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
        weight: {
          current: 78.4,
          dailyWeights: [
            { date: '2026-08-10', value: 78.9 },
            { date: '2026-08-11', value: 78.4 },
          ],
        },
      }}
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
      weights={[
        { date: '2026-08-10', value: 78.9 },
        { date: '2026-08-11', value: 78.4 },
      ]}
      {...overrides}
    />,
  )
}

describe('OverviewDashboard', () => {
  it('renders Översikt as the primary header with date and avatar', () => {
    const markup = renderOverview()

    expect(markup).toContain('class="overview-live-meta"')
    expect(markup).toContain('Väder ej anslutet')
    expect(markup).toContain('Koppla väder')
    expect(markup).not.toContain('--°C')
    expect(markup).not.toContain('-- m/s')
    expect(markup).not.toContain('-- %')
    expect(markup).not.toContain('--:--')
    expect(markup).toContain('<h1>Översikt</h1>')
    expect(markup).not.toContain('Fallback')
    expect(markup).toContain('aria-label="Visa smarta notiser"')
    expect(markup).toContain('aria-label="Lägg till profilbild"')
    expect(markup).toContain('HK')
    expect(markup).not.toContain('Din översikt')
  })

  it('orders primary actions before secondary content', () => {
    const markup = renderOverview()
    const coachIndex = markup.indexOf('AI Coach')
    const bodyIndex = markup.indexOf('Kroppsscanning')
    const foodIndex = markup.indexOf('Matscanning')
    const moreIndex = markup.indexOf('Mer för idag')

    expect(coachIndex).toBeGreaterThan(-1)
    expect(bodyIndex).toBeGreaterThan(coachIndex)
    expect(foodIndex).toBeGreaterThan(bodyIndex)
    expect(moreIndex).toBeGreaterThan(foodIndex)
    expect(markup).toContain('class="overview-primary-visual"')
    expect(markup).toContain('overview-primary-art is-robot')
    expect(markup).toContain('overview-primary-art is-body')
    expect(markup).toContain('overview-primary-art is-meal')
    expect(markup).toContain('is-robot')
    expect(markup).toContain('is-bodyScan')
    expect(markup).toContain('is-foodCamera')
    expect(markup).toContain('Personliga råd från din data')
    expect(markup).toContain('Följ synliga förändringar över tid')
    expect(markup).toContain('Skanna maten och uppskatta näringen')
    expect(markup).toContain('/viktkollen-ai-coach-robot.png')
    expect(markup).toContain('/viktkollen-body-scan.png')
    expect(markup).toContain('Öppna kroppsscanning i helskärm')
    expect(markup).toContain('tap me')
    expect(markup).toContain('overview-body-float-rings')
    expect(markup).toContain('Öppna AI Coach')
    expect(markup).toContain('Öppna matscanning')
    expect(markup).not.toContain('overview-body-scan-stage')
    expect(markup).toContain('/viktkollen-meal-scan.png')
    expect(markup).not.toContain('>AI<')
    expect(markup).not.toContain('>SCAN<')
    expect(markup).not.toContain('>CAM<')
  })

  it('renders weight and calories as main stats without a duplicated goal weight card', () => {
    const markup = renderOverview().replaceAll('\u00a0', ' ')

    expect(markup).toContain('Aktuell vikt')
    expect(markup).toContain('78,4 kg')
    expect(markup).toContain('Kalorier idag')
    expect(markup).toContain('1 840 kcal')
    expect(markup).toContain('is-scale')
    expect(markup).toContain('is-flame')
    expect(markup).toContain('class="overview-weight-sparkline"')
    expect(markup).toContain('class="overview-calorie-progress"')
    expect(markup).not.toContain('Målvikt</span>')
  })

  it('keeps health score, steps and protein inside the compact stats container', () => {
    const markup = renderOverview().replaceAll('\u00a0', ' ')

    expect(markup).toContain('class="overview-compact-tabs"')
    expect(markup).toContain('Health Score')
    expect(markup).toContain('Steg idag')
    expect(markup).toContain('Protein idag')
    expect(markup).toContain('Protein att välja')
    expect(markup).toContain('Kyckling')
    expect(markup).toContain('Nötkött')
    expect(markup).toContain('Ägg')
    expect(markup).toContain('13 956')
    expect(markup).toContain('112 g')
    expect(markup).toContain('is-heart')
    expect(markup).toContain('is-shoe')
    expect(markup).toContain('is-protein')
    expect(markup).not.toContain('>H<')
    expect(markup).not.toContain('>S<')
    expect(markup).not.toContain('>P<')
  })

  it('keeps check-in, advice, smart notifications and more for today reachable', () => {
    const markup = renderOverview()

    expect(markup).toContain('Dagens läge')
    expect(markup).toContain('Råd och notiser')
    expect(markup).toContain('Lägg till profilbild')
    expect(markup).toContain('id="overview-profile-photo-input"')
    expect(markup).toContain('Energi, steg, humör och rörelse')
    expect(markup).toContain('Viktkollen Live')
    expect(markup).toContain('Dagens råd')
    expect(markup).toContain('Smarta notiser')
    expect(markup).toContain('class="overview-attention-grid"')
    expect(markup).toContain('Mer för idag')
    expect(markup).toContain('Dagens måltidsplan')
    expect(markup).toContain('Senaste 7 dagarna')
    expect(markup).toContain('class="overview-secondary-icon"')
  })

  it('uses text fallbacks instead of fake zero values when data is missing', () => {
    const markup = renderOverview({
      calorieGoal: undefined,
      caloriesToday: undefined,
      checkIn: {},
      currentWeight: undefined,
      healthScore: undefined,
      proteinGoal: undefined,
      proteinToday: undefined,
    })

    expect(markup).toContain('Ingen vikt')
    expect(markup).toContain('Registrera vikt')
    expect(markup).toContain('Inga data ännu')
    expect(markup).toContain('—')
    expect(markup).toContain('class="is-empty">Inga data ännu</strong>')
  })

  it('keeps the more-for-today rows open while preserving collapsible details', () => {
    const markup = renderOverview()

    expect(markup).toContain('Dagens måltidsplan')
    expect(markup).toContain('Senaste 7 dagarna')
    expect(markup).toContain('Achievements')
    expect(markup).toContain('Health Prediction')
    expect(markup).toContain('open=""')
    expect(markup).toContain('overview-secondary-content')
    expect(markup).toContain('weekly-progress-card')
  })
})
