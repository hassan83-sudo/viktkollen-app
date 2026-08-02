import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('AdaptiveCoachPanel lazy loading contract', () => {
  it('is lazy-loaded from App.jsx', () => {
    const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')

    expect(appSource).toContain("const AdaptiveCoachPanel = lazy(() => import('./components/AdaptiveCoachPanel.jsx'))")
    expect(appSource).not.toMatch(/import\s+AdaptiveCoachPanel\s+from/)
  })
})
