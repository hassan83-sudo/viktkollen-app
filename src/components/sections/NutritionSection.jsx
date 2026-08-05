import { lazy } from 'react'
import AppErrorBoundary from '../AppErrorBoundary.jsx'
import CheckIn from '../CheckIn.jsx'
import AppSection from '../app/AppSection.jsx'

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
  return (
    <AppSection
      activeSection={activeSection}
      id="nutrition"
      label="Mat och nutrition"
    >
      <article className="panel" id="mat">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Matchecklista</p>
            <h2>Grunder för maten</h2>
          </div>
        </div>

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
      </article>

      <CheckIn
        checkIn={checkIn}
        foodScore={foodScore}
        foodTotal={foods.length}
        onUpdateCheckIn={onUpdateCheckIn}
      />

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
    </AppSection>
  )
}

export default NutritionSection
