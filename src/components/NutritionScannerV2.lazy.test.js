import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('NutritionScannerV2 lazy loading contract', () => {
  it('is lazy-loaded from MealLogger and not imported into App shell', () => {
    const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
    const mealLoggerSource = readFileSync(new URL('./MealLogger.jsx', import.meta.url), 'utf8')

    expect(mealLoggerSource).toContain("const NutritionScannerV2 = lazy(() => import('./NutritionScannerV2.jsx'))")
    expect(appSource).not.toContain('NutritionScannerV2')
  })

  it('keeps provider loading behind the user analysis action', () => {
    const scannerSource = readFileSync(new URL('./NutritionScannerV2.jsx', import.meta.url), 'utf8')

    expect(scannerSource).toContain("await import('../services/nutritionPhotoAnalysisProvider.js')")
    expect(scannerSource).not.toMatch(/import\s+\{\s*analyzeNutritionPhoto/)
  })
})
