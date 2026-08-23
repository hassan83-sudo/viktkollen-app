import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('OverviewFoodScanStage', () => {
  it('opens an ingredients section from the Matscanning card and keeps the camera for scanning', () => {
    const dashboardSource = readFileSync(new URL('./OverviewDashboard.jsx', import.meta.url), 'utf8')
    const stageSource = readFileSync(new URL('./OverviewFoodScanStage.jsx', import.meta.url), 'utf8')

    expect(dashboardSource).toContain("onOpenFoodScan={() => setFoodScanOpen(true)}")
    expect(dashboardSource).toContain('Läs ingredienser')
    expect(dashboardSource).toContain('Skanna mat med kamera')
    expect(dashboardSource).toContain('overview-tap-me')
    expect(stageSource).toContain('Ingredienser')
    expect(stageSource).toContain('nutritionFoods')
    expect(stageSource).toContain('Sök ingrediens')
    expect(stageSource).not.toContain('Skanna maten')
    expect(stageSource).not.toContain('Analysera maten')
  })
})
