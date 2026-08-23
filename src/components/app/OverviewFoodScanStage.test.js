import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { overviewFoodScanStageInternals } from './OverviewFoodScanStage.jsx'

describe('OverviewFoodScanStage', () => {
  it('opens plate ingredients from the Matscanning card and keeps the camera for scanning', () => {
    const dashboardSource = readFileSync(new URL('./OverviewDashboard.jsx', import.meta.url), 'utf8')
    const stageSource = readFileSync(new URL('./OverviewFoodScanStage.jsx', import.meta.url), 'utf8')
    const names = overviewFoodScanStageInternals.getPlateIngredients().map((food) => food.name)

    expect(dashboardSource).toContain("onOpenFoodScan={() => setFoodScanOpen(true)}")
    expect(dashboardSource).toContain('Läs ingredienser')
    expect(dashboardSource).toContain('Skanna mat med kamera')
    expect(stageSource).toContain('På tallriken')
    expect(stageSource).toContain('is-full-art')
    expect(stageSource).not.toContain('nutritionFoods')
    expect(stageSource).not.toContain('Sök ingrediens')
    expect(stageSource).not.toContain('Skanna maten')
    expect(names).toEqual(expect.arrayContaining(['Kyckling', 'Avokado', 'Broccoli', 'Tomat', 'Quinoa']))
    expect(names).not.toContain('Nötkött')
    expect(names).not.toContain('Fläsk')
  })
})
