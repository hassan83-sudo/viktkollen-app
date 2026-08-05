import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('AdaptiveCoachPanel lazy loading contract', () => {
  it('is lazy-loaded from App.jsx', () => {
    const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')

    expect(appSource).toContain("const AdaptiveCoachPanel = lazy(() => import('./components/AdaptiveCoachPanel.jsx'))")
    expect(appSource).toContain("const CoachPlanCenter = lazy(() => import('./components/CoachPlanCenter.jsx'))")
    expect(appSource).toContain("const NutritionCoachCenter = lazy(() => import('./components/NutritionCoachCenter.jsx'))")
    expect(appSource).not.toMatch(/import\s+AdaptiveCoachPanel\s+from/)
    expect(appSource).not.toMatch(/import\s+CoachPlanCenter\s+from/)
    expect(appSource).not.toMatch(/import\s+NutritionCoachCenter\s+from/)
  })

  it('keeps the V7 weekly plan UI lazy-loaded from the coach panel', () => {
    const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
    const panelSource = readFileSync(new URL('./AdaptiveCoachPanel.jsx', import.meta.url), 'utf8')

    expect(panelSource).toContain("const AdaptiveCoachWeeklyPlan = lazy(() => import('./AdaptiveCoachWeeklyPlan.jsx'))")
    expect(appSource).not.toContain('AdaptiveCoachWeeklyPlan')
  })
})
