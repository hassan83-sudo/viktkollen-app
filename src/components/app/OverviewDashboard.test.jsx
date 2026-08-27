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
      reminderState={{
        reminders: [
          {
            enabled: true,
            id: 'reminder-1',
            scheduleType: 'daily',
            time: '18:30',
            title: 'Drick vatten',
          },
        ],
      }}
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
  it('starts Home compact with live info and a fixed profile circle', () => {
    const markup = renderOverview()

    expect(markup).toContain('class="overview-live-meta"')
    expect(markup).toMatch(/Online|Offline/)
    expect(markup).toContain('overview-live-status')
    expect(markup).toContain('Väder ej anslutet')
    expect(markup).toContain('Koppla väder')
    expect(markup).not.toContain('--°C')
    expect(markup).not.toContain('-- m/s')
    expect(markup).not.toContain('-- %')
    expect(markup).not.toContain('--:--')
    expect(markup).toContain('<h1 class="sr-only">Hem</h1>')
    expect(markup).not.toContain('<h1>Översikt</h1>')
    expect(markup).not.toContain('Fallback')
    expect(markup).toContain('aria-label="Visa smarta notiser"')
    expect(markup).toContain('aria-label="Lägg till profilbild"')
    expect(markup).toContain('id="overview-profile-photo-input"')
    expect(markup).toContain('overview-avatar-button')
    expect(markup).toContain('HK')
    expect(markup).not.toContain('Din översikt')
    expect(markup).not.toContain('class="overview-avatar-photo"')
  })

  it('keeps three equal neon primary cards with Tryck på bilden', () => {
    const markup = renderOverview()
    const eyesIndex = markup.indexOf('AI Ögon')
    const bodyIndex = markup.indexOf('Kroppsscanning')
    const foodIndex = markup.indexOf('Matscanning')
    const moreIndex = markup.indexOf('Mer för idag')

    expect(eyesIndex).toBeGreaterThan(-1)
    expect(bodyIndex).toBeGreaterThan(eyesIndex)
    expect(foodIndex).toBeGreaterThan(bodyIndex)
    expect(moreIndex).toBeGreaterThan(foodIndex)
    expect(markup).toContain('class="overview-primary-visual"')
    expect(markup).toContain('overview-primary-art is-eyes')
    expect(markup).toContain('overview-primary-art is-body')
    expect(markup).toContain('overview-primary-art is-meal')
    expect(markup).toContain('is-eyes')
    expect(markup).toContain('is-bodyScan')
    expect(markup).toContain('is-foodCamera')
    expect(markup).toContain('Minne, kläder och sista kollen')
    expect(markup).toContain('Följ kroppens förändringar över tid')
    expect(markup).toContain('Skanna maten och uppskatta näringen')
    expect(markup).toContain('/viktkollen-body-scan.png')
    expect(markup).toContain('Öppna kroppsscanning i helskärm')
    expect(markup).toContain('Tryck på bilden')
    expect(markup).not.toContain('tap me')
    expect(markup).toContain('Öppna kameran')
    expect(markup).toContain('Starta scanning')
    expect(markup).toContain('Skanna maten')
    expect(markup).toContain('overview-primary-action-footer')
    expect(markup).toContain('/viktkollen-meal-scan.png')
    expect(markup).toContain('overview-body-scan-rings')
  })

  it('always shows AI Ögon even when Smart Camera is off', () => {
    const markup = renderOverview({
      featureFlags: {
        eyes: false,
        familySafety: false,
        memory: false,
        mouth: false,
        smartCamera: false,
      },
    })

    expect(markup).toContain('AI Ögon')
    expect(markup).toContain('is-eyes')
    expect(markup).toContain('Öppna kameran')
    expect(markup).toContain('Kroppsscanning')
    expect(markup).toContain('Matscanning')
  })

  it('renders Dagens läge as a 2x2 mood grid with real values', () => {
    const markup = renderOverview().replaceAll('\u00a0', ' ')

    expect(markup).toContain('Dagens läge')
    expect(markup).toContain('class="overview-today-mood"')
    expect(markup).toContain('Chatten')
    expect(markup).toContain('Nästa påminnelse')
    expect(markup).toContain('AI Coach')
    expect(markup).toContain('IDAG')
    expect(markup).toContain('1 840 kcal')
    expect(markup).toContain('78,4 kg')
    expect(markup).toContain('Logga mat')
    expect(markup).toContain('Registrera vikt')
    expect(markup).toContain('Drick vatten')
    expect(markup).not.toContain('class="overview-compact-tabs"')
    expect(markup).not.toContain('Protein att välja')
    expect(markup).not.toContain('is-coach-hero')
  })

  it('keeps the social card visible when callers provide partial feature flags', () => {
    const markup = renderOverview({
      featureFlags: { smartCamera: false },
    })

    expect(markup).toContain('Vänner')
    expect(markup).toContain('Logga in för att träna och hålla kontakten tillsammans.')
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
      healthSnapshot: {
        date: '2026-08-11',
        weight: { current: null, dailyWeights: [] },
      },
      proteinGoal: undefined,
      proteinToday: undefined,
      reminderState: { reminders: [] },
      weights: [],
    })

    expect(markup).toContain('Ingen vikt')
    expect(markup).toContain('Registrera vikt')
    expect(markup).toContain('0 kcal')
    expect(markup).toContain('Ingen påminnelse')
    expect(markup).toContain('Vänner')
  })

  it('shows social setup state while live backend is off', () => {
    const markup = renderOverview({
      featureFlags: { socialLive: false, socialUi: true },
      isAuthenticated: true,
    })
    expect(markup).toContain('Vänner')
    expect(markup).toContain('Chatten är inte ansluten ännu. Ingen fejkdata visas.')
    expect(markup).toContain('Lägg till vän')
    expect(markup).toContain('Öppna chatten')
    expect(markup).not.toContain('Ska vi träna ikväll')
  })

  it('keeps the more-for-today rows open while preserving collapsible details', () => {
    const markup = renderOverview()

    expect(markup).toContain('Dagens måltidsplan')
    expect(markup).toContain('Senaste 7 dagarna')
    expect(markup).toContain('Achievements')
    expect(markup).toContain('Health Prediction')
    expect(markup).toContain('<details')
  })
})
