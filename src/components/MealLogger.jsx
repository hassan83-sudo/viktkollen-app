import MealList from './MealList.jsx'
import PhotoAnalysis from './PhotoAnalysis.jsx'

const proteinKeywords = [
  'ägg',
  'bönor',
  'fisk',
  'keso',
  'kyckling',
  'kvarg',
  'kött',
  'lax',
  'linser',
  'protein',
  'räkor',
  'tonfisk',
  'tofu',
  'yoghurt',
]

function hasProteinToday(meals) {
  const mealText = meals
    .map((meal) => meal.text)
    .join(' ')
    .toLocaleLowerCase('sv-SE')

  return proteinKeywords.some((keyword) => mealText.includes(keyword))
}

function getNextMealTip(meals, hasProtein) {
  const mealText = meals
    .map((meal) => meal.text)
    .join(' ')
    .toLocaleLowerCase('sv-SE')
  const hasFruitOrVegetables =
    mealText.includes('frukt') ||
    mealText.includes('grönsak') ||
    mealText.includes('sallad') ||
    mealText.includes('gurka') ||
    mealText.includes('tomat')

  if (!hasProtein) {
    return 'Nästa måltid: försök få med en enkel proteinkälla.'
  }

  if (!hasFruitOrVegetables) {
    return 'Nästa måltid: försök få med grönsaker eller frukt.'
  }

  return 'Nästa måltid: fortsätt med samma enkla bas.'
}

function MealLogger({
  displayPhotoMeals,
  foodPhotoPreview,
  handleFoodPhotoChange,
  mealOptions,
  mealText,
  mealType,
  meals,
  onAddMeal,
  onAnalyzePhotoMeal,
  onMealTextChange,
  onMealTypeChange,
  photoAnalysisStatus,
}) {
  const mealCount = meals.length
  const hasProtein = hasProteinToday(meals)
  const nextMealTip = getNextMealTip(meals, hasProtein)

  return (
    <article className="panel meals-panel" id="maltider">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Snabbregistrera måltid</p>
          <h2>Måltidsnoteringar</h2>
        </div>
      </div>
      <form className="meal-form" onSubmit={onAddMeal}>
        <select
          value={mealType}
          onChange={(event) => onMealTypeChange(event.target.value)}
        >
          {mealOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Exempel: lax, ris, gurka"
          value={mealText}
          onChange={(event) => onMealTextChange(event.target.value)}
        />
        <button type="submit">Lägg till måltid</button>
      </form>

      <PhotoAnalysis
        displayPhotoMeals={displayPhotoMeals}
        foodPhotoPreview={foodPhotoPreview}
        handleFoodPhotoChange={handleFoodPhotoChange}
        onAnalyzePhotoMeal={onAnalyzePhotoMeal}
        photoAnalysisStatus={photoAnalysisStatus}
      />

      <div className="chart-card">
        <div className="chart-toolbar">
          <div>
            <span>Dagens mat</span>
            <strong>
              🍽️ {mealCount} måltid{mealCount === 1 ? '' : 'er'} registrerade idag.
            </strong>
          </div>
        </div>
        <p className="estimate-note">
          {hasProtein
            ? '💪 Du verkar ha fått i dig protein.'
            : '💪 Protein syns inte tydligt i dagens måltider ännu.'}
        </p>
        <p className="estimate-note">👉 {nextMealTip}</p>
      </div>

      <MealList meals={meals} />
    </article>
  )
}

export default MealLogger
