import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import AppErrorBoundary from '../AppErrorBoundary.jsx'
import CheckIn from '../CheckIn.jsx'
import AppSection from '../app/AppSection.jsx'
import {
  normalizeMeals,
  normalizeNutritionGoals,
  summarizeDay,
} from '../../services/nutritionService.js'
import { logNavigationOrigin } from '../../services/navigation/navigationOriginDiagnostics.js'

const BarcodeScanner = lazy(() => import('../BarcodeScanner.jsx'))
const MealLogger = lazy(() => import('../MealLogger.jsx'))

const todayMealSlots = ['Frukost', 'Lunch', 'Middag', 'Mellanmål']

function goalNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function progressPercent(value, goal) {
  const target = goalNumber(goal)
  if (!target) return null
  return Math.max(0, Math.min(100, Math.round((Number(value || 0) / target) * 100)))
}

function formatCount(value, unit) {
  return `${Math.round(Number(value || 0)).toLocaleString('sv-SE')}${unit}`
}

function NutritionRing({ accent, detail, icon, label, progress, value }) {
  const percent = Number.isFinite(Number(progress)) ? Math.max(0, Math.min(100, Number(progress))) : 0
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const dash = (percent / 100) * circumference

  return (
    <article className={`nutrition-ring is-${accent}`}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle className="nutrition-ring-track" cx="24" cy="24" r={radius} />
        <circle
          className="nutrition-ring-value"
          cx="24"
          cy="24"
          r={radius}
          strokeDasharray={`${dash} ${circumference}`}
        />
        {icon}
      </svg>
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{detail}</small>
    </article>
  )
}

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
  userId,
  weights,
  weekSummary,
}) {
  const [activePanel, setActivePanel] = useState('overview')
  const [insightOpen, setInsightOpen] = useState(false)
  const normalizedMeals = useMemo(() => normalizeMeals(meals), [meals])
  const normalizedGoals = useMemo(() => normalizeNutritionGoals(nutritionGoals), [nutritionGoals])
  const dailySummary = useMemo(
    () => summarizeDay(normalizedMeals, selectedMealDate, normalizedGoals),
    [normalizedGoals, normalizedMeals, selectedMealDate],
  )
  const mealsByType = useMemo(
    () => Object.fromEntries(
      todayMealSlots.map((type) => [
        type,
        (dailySummary.meals || []).filter((meal) => meal.type === type),
      ]),
    ),
    [dailySummary],
  )
  const todaysMeals = dailySummary.meals || []
  const totals = dailySummary.totals || {}
  const calorieGoal = goalNumber(normalizedGoals.calories)
  const proteinGoal = goalNumber(normalizedGoals.protein)
  const carbGoal = goalNumber(normalizedGoals.carbs)
  const fatGoal = goalNumber(normalizedGoals.fat)

  const showPanel = useCallback((panel, targetId) => {
    logNavigationOrigin('nutrition-show-panel:before', { panel, targetId: targetId || '' })
    setActivePanel(panel)
    window.requestAnimationFrame(() => {
      const target = targetId
        ? document.getElementById(targetId)
        : document.getElementById(`nutrition-panel-${panel}`)

      if (onScrollToTarget) {
        onScrollToTarget(target)
        logNavigationOrigin('nutrition-show-panel:after-frame', {
          panel,
          targetFound: Boolean(target),
          targetId: targetId || '',
        })
        return
      }

      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      logNavigationOrigin('nutrition-show-panel:after-frame', {
        panel,
        targetFound: Boolean(target),
        targetId: targetId || '',
      })
    })
  }, [onScrollToTarget])

  useEffect(() => {
    if (navigationIntent?.panel !== 'scanner') return

    window.requestAnimationFrame(() => {
      showPanel('scanner', 'nutrition-scanner-v2')
    })
  }, [navigationIntent, showPanel])

  const insightLead = todaysMeals.length
    ? 'Dagens data är redo. Nästa steg: håll lunchen enkel med protein.'
    : 'Du har inte loggat någon måltid ännu. Nästa steg: lägg till lunch eller skanna maten.'

  return (
    <AppSection
      activeSection={activeSection}
      id="nutrition"
      label="Mat och nutrition"
    >
      <div className="nutrition-premium-shell is-design-7" id="mat">
        <header className="nutrition-page-header">
          <p className="eyebrow">Mat</p>
          <h1>Mat</h1>
        </header>

        <section className="nutrition-ring-grid" aria-label="Dagens näring">
          <p className="nutrition-kicker">Dagens näring</p>
          <NutritionRing
            accent="orange"
            detail={calorieGoal ? `/ ${calorieGoal.toLocaleString('sv-SE')} kcal` : 'Mål saknas'}
            icon={<path d="M24 36c6-2 9-6 9-12 0-5-4-9-7-13-1 4-4 7-6 9-1-2-1-5 0-8-4 3-7 8-7 13 0 6 4 10 11 11Z" />}
            label="kcal"
            progress={progressPercent(totals.calories, calorieGoal)}
            value={formatCount(totals.calories, '')}
          />
          <NutritionRing
            accent="green"
            detail={proteinGoal ? `/ ${proteinGoal.toLocaleString('sv-SE')} g` : 'Mål saknas'}
            icon={<path d="M18 30c0-6 3-10 6-14 3 4 6 8 6 14 0 5-3 8-6 8s-6-3-6-8Z" />}
            label="Protein"
            progress={progressPercent(totals.protein, proteinGoal)}
            value={formatCount(totals.protein, ' g')}
          />
          <NutritionRing
            accent="cyan"
            detail={carbGoal ? `/ ${carbGoal.toLocaleString('sv-SE')} g` : 'Idag'}
            icon={<path d="M24 12c7 4 11 9 11 15a11 11 0 0 1-22 0c0-6 4-11 11-15Z" />}
            label="Kolhydrater"
            progress={progressPercent(totals.carbs, carbGoal)}
            value={formatCount(totals.carbs, ' g')}
          />
          <NutritionRing
            accent="purple"
            detail={fatGoal ? `/ ${fatGoal.toLocaleString('sv-SE')} g` : 'Idag'}
            icon={<path d="M24 11c7 8 11 13 11 20a11 11 0 0 1-22 0c0-7 4-12 11-20Z" />}
            label="Fett"
            progress={progressPercent(totals.fat, fatGoal)}
            value={formatCount(totals.fat, ' g')}
          />
        </section>

        <section className="nutrition-quick-tiles" aria-label="Snabbval">
          <p className="nutrition-kicker">Snabbval</p>
          <button className="nutrition-quick-tile is-scan" type="button" onClick={() => showPanel('scanner', 'nutrition-scanner-v2')}>
            <svg aria-hidden="true" viewBox="0 0 48 48"><rect x="9" y="14" width="30" height="24" rx="8" fill="none" stroke="currentColor" strokeWidth="3" /><circle cx="24" cy="26" r="7" fill="none" stroke="currentColor" strokeWidth="3" /></svg>
            Skanna mat
          </button>
          <button className="nutrition-quick-tile is-add" type="button" onClick={() => showPanel('meals', 'nutrition-meal-editor')}>
            <svg aria-hidden="true" viewBox="0 0 48 48"><path d="M24 12v24M12 24h24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" /></svg>
            Lägg till måltid
          </button>
          <button className="nutrition-quick-tile is-recipe" type="button" onClick={() => showPanel('recipes')}>
            <svg aria-hidden="true" viewBox="0 0 48 48"><path d="M16 36V16c0-6 16-6 16 0v20M14 36h20" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M20 16c0-4 8-4 8 0" fill="none" stroke="currentColor" strokeWidth="3" /></svg>
            Recept
          </button>
          <button className="nutrition-quick-tile is-plan" type="button" onClick={() => showPanel('plan')}>
            <svg aria-hidden="true" viewBox="0 0 48 48"><rect x="10" y="12" width="28" height="26" rx="6" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M16 9v7M32 9v7M10 21h28" fill="none" stroke="currentColor" strokeWidth="3" /></svg>
            Planera dagen
          </button>
        </section>

        <section className="nutrition-today-rows" aria-label="Dagens måltider">
          <div className="nutrition-section-row">
            <p className="nutrition-kicker">Dagens måltider</p>
            <button className="nutrition-text-link" type="button" onClick={() => showPanel('meals', 'nutrition-meal-editor')}>
              Lägg till måltid
            </button>
          </div>
          {todayMealSlots.map((type) => {
            const slotMeals = mealsByType[type] || []
            const latest = slotMeals[0]
            return (
              <div className="nutrition-meal-row" key={type}>
                <span className="nutrition-meal-dot" aria-hidden="true" />
                <span>
                  <strong>{type}</strong>
                  <small>
                    {latest
                      ? `${latest.text || latest.name || 'Måltid'} · ${Math.round(Number(latest.calories || 0))} kcal`
                      : 'Inget registrerat'}
                  </small>
                </span>
                <button
                  aria-label={`Lägg till ${type.toLocaleLowerCase('sv-SE')}`}
                  className="nutrition-meal-add"
                  type="button"
                  onClick={() => showPanel('meals', 'nutrition-meal-editor')}
                >
                  +
                </button>
              </div>
            )
          })}
        </section>

        <section className="nutrition-ai-panel" aria-label="AI-insikt">
          <p className="nutrition-kicker">AI-insikt</p>
          <p>{insightLead}</p>
          {insightOpen && (
            <p>
              {todaysMeals.length
                ? `${todaysMeals.length} måltider är loggade. Öppna scanner eller planen om du vill justera dagen.`
                : 'Skanna tallriken eller lägg till frukost, lunch, middag eller mellanmål.'}
            </p>
          )}
          <button className="nutrition-text-link" type="button" onClick={() => setInsightOpen((current) => !current)}>
            {insightOpen ? 'Visa mindre' : 'Visa mer'}
          </button>
        </section>

        <section className="nutrition-checkin-compact" aria-label="Dagens check-in">
          <p className="nutrition-kicker">Dagens check-in</p>
          <div className="nutrition-checkin-grid">
            <div>
              <span>Energi</span>
              <strong>{Number.isFinite(Number(checkIn?.energy)) ? `${checkIn.energy}/10` : '—'}</strong>
            </div>
            <div>
              <span>Steg</span>
              <strong>{Number.isFinite(Number(checkIn?.steps)) ? Number(checkIn.steps).toLocaleString('sv-SE') : '—'}</strong>
            </div>
            <div>
              <span>Humör</span>
              <strong>{checkIn?.mood || '—'}</strong>
            </div>
            <div>
              <span>Rörelse</span>
              <strong>{checkIn?.workout ? 'Ja' : 'Nej'}</strong>
            </div>
          </div>
        </section>

        <details className="nutrition-fold" id="nutrition-panel-overview" open={activePanel === 'overview'}>
          <summary>Ändra check-in och matchecklista</summary>
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
          <Suspense fallback={<div className="lazy-section-fallback" role="status">Laddar måltidscenter...</div>}>
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
            userId={userId}
            weights={weights}
            weekSummary={weekSummary}
          />
          </Suspense>
        </AppErrorBoundary>

        <details className="nutrition-fold" id="nutrition-patterns">
          <summary>Mönster & historik</summary>
          <button className="nutrition-text-link" type="button" onClick={() => showPanel('history')}>
            Öppna historik och veckomönster
          </button>
        </details>

        <details className="nutrition-fold" id="nutrition-tools">
          <summary>Verktyg</summary>
          <div className="nutrition-tool-links">
            <button type="button" onClick={() => showPanel('favorites')}>Favoriter</button>
            <button type="button" onClick={() => showPanel('barcode', 'streckkod')}>Streckkod</button>
            <button type="button" onClick={() => showPanel('goals')}>Näringsmål</button>
            <button type="button" onClick={() => showPanel('more')}>Import, recension och mer</button>
          </div>
        </details>

        <details className="nutrition-fold" id="nutrition-panel-barcode" open={activePanel === 'barcode'}>
          <summary>Streckkod</summary>
          <Suspense fallback={null}>
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
          </Suspense>
        </details>
      </div>
    </AppSection>
  )
}

export default NutritionSection
