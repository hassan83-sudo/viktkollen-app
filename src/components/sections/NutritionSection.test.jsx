import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import NutritionSection from './NutritionSection.jsx'

vi.mock('../MealLogger.jsx', () => ({ default: () => null }))
vi.mock('../BarcodeScanner.jsx', () => ({ default: () => null }))

function renderNutrition(overrides = {}) {
  return renderToStaticMarkup(
    <NutritionSection
      activeSection="nutrition"
      barcodeInput=""
      barcodeScannerActive={false}
      barcodeStatus=""
      barcodeVideoRef={{ current: null }}
      checkIn={{ energy: 6, mood: 'Fokuserad', steps: 7200, workout: true }}
      displayPhotoMeals={[]}
      favoriteMeals={[]}
      foodPhotoPreview=""
      foods={[{ id: 'water', label: 'Vatten', done: false }]}
      foodScore={0}
      handleFoodPhotoChange={vi.fn()}
      healthSnapshot={{ date: '2026-08-22' }}
      mealHistoryImportSummary=""
      meals={[]}
      navigationIntent={null}
      nutritionGoals={{ calories: 2000, protein: 140 }}
      onAnalyzePhotoMeal={vi.fn()}
      onBarcodeInputChange={vi.fn()}
      onCancelClearMealHistory={vi.fn()}
      onClearMealHistory={vi.fn()}
      onCreateDemoMealDay={vi.fn()}
      onExportMealHistory={vi.fn()}
      onFavoriteMealsChange={vi.fn()}
      onFoodToggle={vi.fn()}
      onImportMealHistory={vi.fn()}
      onMealsChange={vi.fn()}
      onNutritionGoalsChange={vi.fn()}
      onSelectedMealDateChange={vi.fn()}
      onScrollToTarget={vi.fn()}
      onShowClearMealHistory={vi.fn()}
      onStartBarcodeScanner={vi.fn()}
      onStopBarcodeScanner={vi.fn()}
      onSubmitManualBarcode={vi.fn()}
      onUpdateCheckIn={vi.fn()}
      photoAnalysisStatus=""
      profile={{}}
      scannedProducts={[]}
      selectedMealDate="2026-08-22"
      showClearMealHistoryConfirm={false}
      userId="user-1"
      weights={[]}
      weekSummary={{}}
      {...overrides}
    />,
  )
}

describe('NutritionSection design 7', () => {
  it('renders ring metrics, rectangular quick actions and compact meal rows', () => {
    const markup = renderNutrition().replaceAll('\u00a0', ' ')

    expect(markup).toContain('class="nutrition-ring-grid"')
    expect(markup).toContain('Dagens näring')
    expect(markup).toContain('Skanna mat')
    expect(markup).toContain('Lägg till måltid')
    expect(markup).toContain('Recept')
    expect(markup).toContain('Planera dagen')
    expect(markup).toContain('Frukost')
    expect(markup).toContain('Lunch')
    expect(markup).toContain('Middag')
    expect(markup).toContain('Mellanmål')
    expect(markup).toContain('Inget registrerat')
    expect(markup).toContain('AI-insikt')
    expect(markup).toContain('Energi')
    expect(markup).toContain('6/10')
    expect(markup).toContain('7 200')
    expect(markup).toContain('Fokuserad')
    expect(markup).toContain('Mönster &amp; historik')
    expect(markup).toContain('Verktyg')
    expect(markup).not.toContain('vk-empty-state')
    expect(markup).not.toContain('Börja med ett foto eller lägg till måltiden manuellt.')
  })
})
