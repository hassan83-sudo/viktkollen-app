import { lazy, useCallback, useEffect, useMemo, useState } from 'react'
import AppErrorBoundary from '../AppErrorBoundary.jsx'
import CheckIn from '../CheckIn.jsx'
import AppSection from '../app/AppSection.jsx'
import {
  ViktkollenButton,
  ViktkollenCard,
  ViktkollenEmptyState,
  ViktkollenMetric,
  ViktkollenSectionHeader,
  ViktkollenTabs,
} from '../app/ViktkollenDesign.jsx'
import {
  normalizeMeals,
  normalizeNutritionGoals,
  summarizeDay,
} from '../../services/nutritionService.js'

const BarcodeScanner = lazy(() => import('../BarcodeScanner.jsx'))
const MealLogger = lazy(() => import('../MealLogger.jsx'))

function NutritionSection({
  activeSection,
  barcodeInput,
  barcodeScannerActive,
  barcodeStatus,
  barcodeVideoRef,
  checkIn,
  displayPhotoMeals,
  favoriteMeals,
  foodPhotoPreview,
  foods,
  foodScore,
  handleFoodPhotoChange,
  healthSnapshot,
  mealHistoryImportSummary,
  meals,
  navigationIntent,
  nutritionGoals,
  onAnalyzePhotoMeal,
  onBarcodeInputChange,
  onCancelClearMealHistory,
  onClearMealHistory,
  onCreateDemoMealDay,
  onExportMealHistory,
  onFavoriteMealsChange,
  onFoodToggle,
  onImportMealHistory,
  onMealsChange,
  onNutritionGoalsChange,
  onSelectedMealDateChange,
  onScrollToTarget,
  onShowClearMealHistory,
  onStartBarcodeScanner,
  onStopBarcodeScanner,
  onSubmitManualBarcode,
  onUpdateCheckIn,
  photoAnalysisStatus,
  profile,
  scannedProducts,
  selectedMealDate,
  showClearMealHistoryConfirm,
  weights,
  weekSummary,
}) {
  const [activePanel, setActivePanel] = useState('overview')
  const normalizedMeals = useMemo(() => normalizeMeals(meals), [meals])
  const normalizedGoals = useMemo(() => normalizeNutritionGoals(nutritionGoals), [nutritionGoals])
  const dailySummary = useMemo(
    () => summarizeDay(normalizedMeals, selectedMealDate, normalizedGoals),
    [normalizedGoals, normalizedMeals, selectedMealDate],
  )
  const todaysMeals = dailySummary.meals || []
  const totals = dailySummary.totals || {}
  const calorieGoal = Number(normalizedGoals.calories || normalizedGoals.calorieGoal || 0)
  const proteinGoal = Number(normalizedGoals.protein || normalizedGoals.proteinGoal || 0)
  const calorieProgress = calorieGoal > 0 ? (Number(totals.calories || 0) / calorieGoal) * 100 : null
  const proteinProgress = proteinGoal > 0 ? (Number(totals.protein || 0) / proteinGoal) * 100 : null

  const showPanel = useCallback((panel, targetId) => {
    setActivePanel(panel)
    window.requestAnimationFrame(() => {
      const target = targetId
        ? document.getElementById(targetId)
        : document.getElementById(`nutrition-panel-${panel}`)

      if (onScrollToTarget) {
        onScrollToTarget(target)
        return
      }

      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [onScrollToTarget])

  useEffect(() => {
    if (navigationIntent?.panel !== 'scanner') return

    window.requestAnimationFrame(() => {
      showPanel('scanner', 'nutrition-scanner-v2')
    })
  }, [navigationIntent, showPanel])

  return (
    <AppSection
      activeSection={activeSection}
      id="nutrition"
      label="Mat och nutrition"
    >
      <div className="nutrition-premium-shell" id="mat">
        <ViktkollenSectionHeader
          eyebrow="Mat"
          title="Dagens näring"
          subtitle="Skanna, logga och styr dagens måltider utan att leta bland alla verktyg."
        />

        <section className="nutrition-metric-grid" aria-label="Dagens näringsstatus">
          <ViktkollenMetric
            accent="orange"
            label="Kalorier"
            value={`${Math.round(Number(totals.calories || 0)).toLocaleString('sv-SE')}`}
            detail={calorieGoal > 0 ? `/ ${calorieGoal.toLocaleString('sv-SE')} kcal` : 'Mål saknas'}
            progress={calorieProgress}
          />
          <ViktkollenMetric
            accent="green"
            label="Protein"
            value={`${Math.round(Number(totals.protein || 0)).toLocaleString('sv-SE')} g`}
            detail={proteinGoal > 0 ? `/ ${proteinGoal.toLocaleString('sv-SE')} g` : 'Mål saknas'}
            progress={proteinProgress}
          />
          <ViktkollenMetric
            accent="cyan"
            label="Kolhydrater"
            value={`${Math.round(Number(totals.carbs || 0)).toLocaleString('sv-SE')} g`}
            detail="Idag"
          />
          <ViktkollenMetric
            accent="pink"
            label="Fett"
            value={`${Math.round(Number(totals.fat || 0)).toLocaleString('sv-SE')} g`}
            detail="Idag"
          />
        </section>

        <section className="nutrition-quick-actions" aria-label="Snabbåtgärder för mat">
          <ViktkollenButton onClick={() => showPanel('scanner', 'nutrition-scanner-v2')}>Skanna mat</ViktkollenButton>
          <ViktkollenButton tone="cyan" onClick={() => showPanel('meals', 'nutrition-meal-editor')}>Lägg till måltid</ViktkollenButton>
          <ViktkollenButton tone="purple" onClick={() => showPanel('recipes')}>Recept</ViktkollenButton>
          <ViktkollenButton tone="green" onClick={() => showPanel('plan')}>Planera dagen</ViktkollenButton>
          <ViktkollenButton tone="pink" onClick={() => showPanel('favorites')}>Favoriter</ViktkollenButton>
          <ViktkollenButton tone="ghost" onClick={() => showPanel('barcode', 'streckkod')}>Streckkod</ViktkollenButton>
        </section>

        <ViktkollenTabs
          value={activePanel}
          onChange={setActivePanel}
          items={[
            { label: 'Översikt', value: 'overview' },
            { label: 'Måltider', value: 'meals' },
            { label: 'Scanner', value: 'scanner' },
            { label: 'Recept', value: 'recipes' },
            { label: 'Plan', value: 'plan' },
            { label: 'Historik', value: 'history' },
            { label: 'Mål', value: 'goals' },
            { label: 'Mer', value: 'more' },
          ]}
        />

        <section className="nutrition-today-card" aria-label="Dagens måltider">
          <ViktkollenSectionHeader
            title="Dagens måltider"
            subtitle={todaysMeals.length ? `${todaysMeals.length} måltider loggade` : 'Inga måltider idag'}
          />
          {todaysMeals.length ? (
            <div className="nutrition-meal-card-list">
              {todaysMeals.slice(0, 4).map((meal) => (
                <ViktkollenCard className="nutrition-meal-card" key={meal.id || `${meal.date}-${meal.time}-${meal.text}`}>
                  <span className="nutrition-meal-thumb" aria-hidden="true">{meal.type?.slice(0, 1) || 'M'}</span>
                  <div>
                    <strong>{meal.type || 'Måltid'}</strong>
                    <small>{meal.time || 'Tid saknas'} · {meal.text || meal.name || 'Ingen beskrivning'}</small>
                  </div>
                  <span>{Math.round(Number(meal.calories || 0))} kcal</span>
                </ViktkollenCard>
              ))}
            </div>
          ) : (
            <ViktkollenEmptyState
              title="Inga måltider idag"
              actions={(
                <>
                  <ViktkollenButton onClick={() => showPanel('scanner', 'nutrition-scanner-v2')}>Skanna mat</ViktkollenButton>
                  <ViktkollenButton tone="cyan" onClick={() => showPanel('meals', 'nutrition-meal-editor')}>Lägg till måltid</ViktkollenButton>
                </>
              )}
            >
              Börja med ett foto eller lägg till måltiden manuellt.
            </ViktkollenEmptyState>
          )}
        </section>

        <ViktkollenCard className="nutrition-ai-card">
          <p className="eyebrow">AI-insikt</p>
          <strong>{todaysMeals.length ? 'Dagens data är redo för coachning.' : 'Du har inte loggat någon måltid ännu.'}</strong>
          <p>{todaysMeals.length ? 'Öppna AI-plan eller historik för mer analys.' : 'Nästa steg: lägg till lunch eller skanna maten.'}</p>
        </ViktkollenCard>

        <details className="vk-details" id="nutrition-panel-overview" open={activePanel === 'overview'}>
          <summary>Matchecklista och check-in</summary>
          <div className="checklist">
            {foods.map((item) => (
              <label className="toggle-row" key={item.id}>
                <input
                  checked={item.done}
                  onChange={() => onFoodToggle(item.id)}
                  type="checkbox"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
          <CheckIn
            checkIn={checkIn}
            foodScore={foodScore}
            foodTotal={foods.length}
            onUpdateCheckIn={onUpdateCheckIn}
          />
        </details>

        <AppErrorBoundary
          area="nutrition"
          resetKey={`${selectedMealDate}-${meals.length}-${displayPhotoMeals.length}`}
          title="Måltidscentret kunde inte visas"
        >
          <MealLogger
            displayPhotoMeals={displayPhotoMeals}
            favoriteMeals={favoriteMeals}
            foodPhotoPreview={foodPhotoPreview}
            handleFoodPhotoChange={handleFoodPhotoChange}
            healthSnapshot={healthSnapshot}
            importSummary={mealHistoryImportSummary}
            initialPanel={activePanel}
            navigationIntent={navigationIntent}
            meals={meals}
            nutritionGoals={nutritionGoals}
            onAnalyzePhotoMeal={onAnalyzePhotoMeal}
            onCancelClearMealHistory={onCancelClearMealHistory}
            onClearMealHistory={onClearMealHistory}
            onCreateDemoMealDay={onCreateDemoMealDay}
            onExportMealHistory={onExportMealHistory}
            onFavoriteMealsChange={onFavoriteMealsChange}
            onImportMealHistory={onImportMealHistory}
            onMealsChange={onMealsChange}
            onNutritionGoalsChange={onNutritionGoalsChange}
            onSelectedMealDateChange={onSelectedMealDateChange}
            onShowClearMealHistory={onShowClearMealHistory}
            photoAnalysisStatus={photoAnalysisStatus}
            profile={profile}
            selectedMealDate={selectedMealDate}
            showClearMealHistoryConfirm={showClearMealHistoryConfirm}
            weights={weights}
            weekSummary={weekSummary}
          />
        </AppErrorBoundary>

        <details className="vk-details" id="nutrition-panel-barcode" open={activePanel === 'barcode'}>
          <summary>Streckkod</summary>
          <BarcodeScanner
            barcodeInput={barcodeInput}
            barcodeScannerActive={barcodeScannerActive}
            barcodeStatus={barcodeStatus}
            barcodeVideoRef={barcodeVideoRef}
            onBarcodeInputChange={onBarcodeInputChange}
            onStartBarcodeScanner={onStartBarcodeScanner}
            onStopBarcodeScanner={onStopBarcodeScanner}
            onSubmitManualBarcode={onSubmitManualBarcode}
            scannedProducts={scannedProducts}
          />
        </details>
      </div>
    </AppSection>
  )
}

export default NutritionSection
