import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import AdaptiveCoachWeeklyPlan from './AdaptiveCoachWeeklyPlan.jsx'

const analysisDate = '2026-07-31'

function renderPlan(props = {}) {
  return renderToStaticMarkup(
    <AdaptiveCoachWeeklyPlan
      adaptiveCoachFeedback={{}}
      analysisDate={analysisDate}
      checkIns={[
        { date: '2026-07-21', energy: 6, steps: 7200 },
        { date: '2026-07-22', energy: 6, steps: 7100 },
        { date: '2026-07-26', energy: 4, steps: 3000 },
        { date: '2026-07-27', energy: 4, steps: 3200 },
      ]}
      goalsHabits={{}}
      meals={[
        { date: '2026-07-21', protein: 90 },
        { date: '2026-07-22', protein: 92 },
        { date: '2026-07-26', protein: 38 },
        { date: '2026-07-27', protein: 42 },
      ]}
      onAdaptiveCoachFeedbackChange={() => {}}
      onCancel={() => {}}
      onGoalsHabitsChange={() => {}}
      onReminderStateChange={() => {}}
      reminderState={{}}
      weights={[
        { date: '2026-07-21', value: 91.8 },
        { date: analysisDate, value: 89.6 },
      ]}
      {...props}
    />,
  )
}

describe('AdaptiveCoachWeeklyPlan', () => {
  it('renders editable weekly plan controls without technical values', () => {
    const markup = renderPlan()

    expect(markup).toContain('Redigerbar veckoplan')
    expect(markup).toContain('Observerade mönster')
    expect(markup).toContain('Föreslagna actions')
    expect(markup).toContain('Bekräfta')
    expect(markup).toContain('Avbryt')
    expect(markup).not.toMatch(/\b(undefined|null|NaN|Infinity)\b|\[object Object\]/)
  })

  it('shows safe no-data fallback', () => {
    const markup = renderPlan({ checkIns: [], meals: [], weights: [] })

    expect(markup).toContain('Underlag')
    expect(markup).toContain('Inget sparas innan du bekräftar')
    expect(markup).not.toMatch(/diagnos|svält|kommer att/i)
  })
})
