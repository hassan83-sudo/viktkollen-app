import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('AdaptiveCoachPanel lazy loading contract', () => {
  it('is lazy-loaded from CoachSection.jsx', () => {
    const coachSectionSource = readFileSync(
      new URL('./sections/CoachSection.jsx', import.meta.url),
      'utf8',
    )

    expect(coachSectionSource).toContain(
      "const AdaptiveCoachPanel = lazy(() => import('../AdaptiveCoachPanel.jsx'))",
    )
    expect(coachSectionSource).toContain(
      "const CoachPlanCenter = lazy(() => import('../CoachPlanCenter.jsx'))",
    )
    expect(coachSectionSource).toContain(
      "const NutritionCoachCenter = lazy(() => import('../NutritionCoachCenter.jsx'))",
    )
    expect(coachSectionSource).toContain(
      "const PredictionCenter = lazy(() => import('../PredictionCenter.jsx'))",
    )
    expect(coachSectionSource).toContain(
      "const HealthJourneyCenter = lazy(() => import('../HealthJourneyCenter.jsx'))",
    )
    expect(coachSectionSource).toContain(
      "const HabitGoalCenter = lazy(() => import('../HabitGoalCenter.jsx'))",
    )

    expect(coachSectionSource).not.toMatch(
      /import\s+AdaptiveCoachPanel\s+from/,
    )
    expect(coachSectionSource).not.toMatch(
      /import\s+CoachPlanCenter\s+from/,
    )
    expect(coachSectionSource).not.toMatch(
      /import\s+NutritionCoachCenter\s+from/,
    )
    expect(coachSectionSource).not.toMatch(
      /import\s+PredictionCenter\s+from/,
    )
    expect(coachSectionSource).not.toMatch(
      /import\s+HealthJourneyCenter\s+from/,
    )
    expect(coachSectionSource).not.toMatch(
      /import\s+HabitGoalCenter\s+from/,
    )
  })

  it('keeps the V7 weekly plan UI lazy-loaded from the coach panel', () => {
    const appSource = readFileSync(
      new URL('../App.jsx', import.meta.url),
      'utf8',
    )
    const panelSource = readFileSync(
      new URL('./AdaptiveCoachPanel.jsx', import.meta.url),
      'utf8',
    )

    expect(panelSource).toContain(
      "const AdaptiveCoachWeeklyPlan = lazy(() => import('./AdaptiveCoachWeeklyPlan.jsx'))",
    )
    expect(appSource).not.toContain('AdaptiveCoachWeeklyPlan')
  })
})