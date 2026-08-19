import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createAiCoachV2Report } from '../services/aiCoachV2Service.js'
import AICoach from './AICoach.jsx'

function html(overrides = {}) {
  return renderToStaticMarkup(
    <AICoach
      coachMessage=""
      coachReport={null}
      coachReports={[]}
      coachStatus=""
      isGeneratingReport={false}
      onClearCoachReports={vi.fn()}
      onCreateCoachReport={vi.fn()}
      onDeleteCoachReport={vi.fn()}
      onRecommendationFeedback={vi.fn()}
      {...overrides}
    />,
  )
}

describe('AICoach', () => {
  it('renders a safe empty fallback when no coach message exists', () => {
    const markup = html()

    expect(markup).toContain('Coachen saknar tillräckligt med data just nu')
    expect(markup).toContain('AI-tjänsten inte är tillgänglig')
    expect(markup).toContain('första coachrapport')
  })

  it('announces loading while generating a report', () => {
    const markup = html({ isGeneratingReport: true })

    expect(markup).toContain('Analyserar senaste vikt, måltider och check-in')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('disabled=""')
  })

  it('renders Coach V2 recommendations with evidence and feedback controls', () => {
    const coachReport = createAiCoachV2Report({
      checkIn: { date: '2026-07-31', energy: 3, mood: 'Trött', steps: 2500, workout: false },
      meals: [{ calories: 420, date: '2026-07-31', id: 'meal-1', name: 'Ris och grönsaker', protein: 18, type: 'Lunch' }],
      nutritionGoals: { calories: 2100, protein: 120 },
      profile: { activityLevel: 'medium', goalWeight: 82, height: 178, name: 'Alex', startWeight: 92 },
      today: '2026-07-31',
      weights: [
        { date: '2026-07-24', value: 91.1 },
        { date: '2026-07-31', value: 89.6 },
      ],
    })
    const markup = html({
      coachReport,
    })

    expect(markup).toContain('Dagens råd')
    expect(markup).toContain('Rekommendationer')
    expect(markup).toContain('Varför detta råd?')
    expect(markup).toContain('Hjälpsamt')
    expect(markup).toContain('Inte relevant')
    expect(markup).toContain('Veckorapport V2')
  })
})
