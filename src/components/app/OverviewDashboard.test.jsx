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
  it('starts Home compact with live info and a fixed profile circle', () => {
    const markup = renderOverview()

    expect(markup).toContain('class="overview-live-meta"')
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

  it('orders primary actions before secondary content', () => {
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
    expect(markup).toContain('tap me')
    expect(markup).toContain('Öppna AI Ögon')
    expect(markup).toContain('Öppna AI Coach')
    expect(markup).toContain('is-coach-hero')
    const eyesBlock = markup.slice(markup.indexOf('is-eyes'), markup.indexOf('is-body'))
    expect(eyesBlock).toContain('tap me')
    expect(eyesBlock).toContain('Öppna AI Ögon')
    expect(markup).toContain('Läs ingredienser')
    expect(markup).toContain('Skanna kropp med kamera')
    expect(markup).toContain('Skanna mat med kamera')
    expect(markup).not.toContain('Öppna matscanning')
    expect(markup).not.toContain('overview-body-scan-stage')
    expect(markup).toContain('overview-body-scan-rings')
    expect(markup).not.toContain('overview-body-float-rings')
    expect(markup).toContain('/viktkollen-meal-scan.png')
    expect(markup).not.toContain('>AI<')
    expect(markup).not.toContain('>SCAN<')
    expect(markup).not.toContain('>CAM<')
  })

  it('renders AI Coach in the old AI-ögon slot and keeps real weight beside steps', () => {
    const markup = renderOverview().replaceAll('\u00a0', ' ')

    expect(markup).toContain('AI Ögon')
    expect(markup).toContain('AI Coach')
    expect(markup).toContain('is-coach-hero')
    expect(markup).not.toContain('is-smart-camera')
    expect(markup).toContain('IDAG')
    expect(markup).toContain('Steg idag')
    expect(markup).toContain('Vikt')
    expect(markup).toContain('78,4 kg')
    expect(markup).toContain('Kalorier')
    expect(markup).toContain('1 840')
    expect(markup).toContain('2 200')
    expect(markup).toContain('kcal')
    expect(markup).toContain('is-flame')
    expect(markup).toContain('class="overview-weight-sparkline"')
    expect(markup).toContain('class="overview-calorie-progress"')
    expect(markup).not.toContain('Målvikt</span>')
    expect(markup).not.toContain('Family &amp; Safety')
    expect(markup).not.toContain('Walkie')
  })

  it('hides AI Ögon when Smart Camera is off and keeps compact IDAG weight beside steps', () => {
    const markup = renderOverview({
      featureFlags: {
        eyes: false,
        familySafety: false,
        memory: false,
        mouth: false,
        smartCamera: false,
      },
    }).replaceAll('\u00a0', ' ')

    expect(markup).not.toContain('is-smart-camera')
    expect(markup).not.toContain('AI Ögon')
    expect(markup).toContain('AI Coach')
    expect(markup).toContain('IDAG')
    expect(markup).toContain('Steg idag')
    expect(markup).toContain('78,4 kg')
    expect(markup).toContain('1 840')
    expect(markup).toContain('kcal')
    expect(markup).not.toContain('Aktuell vikt')
    expect(markup).not.toContain('Family &amp; Safety')
  })

  it('keeps the social card visible when callers provide partial feature flags', () => {
    const markup = renderOverview({
      featureFlags: { smartCamera: false },
    })

    expect(markup).toContain('Vänner')
    expect(markup).toContain('Logga in för att träna och hålla kontakten tillsammans.')
  })

  it('keeps health score and protein compact while steps live beside weight', () => {
    const markup = renderOverview().replaceAll('\u00a0', ' ')

    expect(markup).toContain('class="overview-compact-tabs"')
    expect(markup).toContain('Health Score')
    expect(markup).toContain('Steg idag')
    expect(markup).toContain('overview-today-pair')
    expect(markup).toContain('Protein idag')
    expect(markup).toContain('Protein att välja')
    expect(markup).toContain('Kyckling')
    expect(markup).toContain('Nötkött')
    expect(markup).toContain('Ägg')
    expect(markup).toContain('13 956')
    expect(markup).toContain('112 g')
    expect(markup).toContain('is-heart')
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
      healthSnapshot: {
        date: '2026-08-11',
        weight: { current: null, dailyWeights: [] },
      },
      proteinGoal: undefined,
      proteinToday: undefined,
      weights: [],
    })

    expect(markup).toContain('Ingen vikt')
    expect(markup).toContain('Registrera vikt')
    expect(markup).toContain('Inga data ännu')
    expect(markup).toContain('Inte anslutet')
    expect(markup).toContain('—')
    expect(markup).toContain('class="is-empty">Inga data ännu</strong>')
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
    expect(markup).toContain('open=""')
    expect(markup).toContain('overview-secondary-content')
    expect(markup).toContain('weekly-progress-card')
  })
})
