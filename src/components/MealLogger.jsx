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

function hasProteinToday(meals, photoMeals) {
  const mealText = [
    ...meals.map((meal) => meal.text),
    ...photoMeals.map((meal) => meal.analysis?.likelyProtein || ''),
  ]
    .join(' ')
    .toLocaleLowerCase('sv-SE')

  return proteinKeywords.some((keyword) => mealText.includes(keyword))
}

function hasVegetablesToday(meals, photoMeals) {
  const mealText = [
    ...meals.map((meal) => meal.text),
    ...photoMeals.map((meal) => meal.analysis?.likelyVegetables || ''),
  ]
    .join(' ')
    .toLocaleLowerCase('sv-SE')

  return ['frukt', 'grönsak', 'sallad', 'gurka', 'tomat', 'bär'].some(
    (keyword) => mealText.includes(keyword),
  )
}

function getTodaysPhotoMeals(photoMeals) {
  const today = new Date().toLocaleDateString('sv-SE')

  return photoMeals.filter(
    (meal) => new Date(meal.createdAt).toLocaleDateString('sv-SE') === today,
  )
}

function getBestMeal(photoMeals) {
  return (
    photoMeals.find((meal) =>
      String(meal.analysis?.proteinStatus || '')
        .toLocaleLowerCase('sv-SE')
        .includes('protein'),
    ) || photoMeals[0]
  )
}

function getDailyMealSummary({ hasProtein, hasVegetables, mealCount, photoMeals }) {
  if (mealCount === 0 && photoMeals.length === 0) {
    return 'Logga en måltid eller analysera en bild så sammanfattar Matcoachen dagen.'
  }

  const proteinText = hasProtein
    ? 'protein verkar finnas med'
    : 'protein är dagens enklaste förbättring'
  const vegetableText = hasVegetables
    ? 'grönsaker eller frukt syns också'
    : 'lägg gärna till något grönt eller frukt'

  return `Dagens mat ser ut att ha ${proteinText}, och ${vegetableText}. Fortsätt tänka en måltid i taget.`
}

function getNextMealTip(hasProtein, hasVegetables) {
  if (!hasProtein) {
    return 'Nästa måltid: försök få med en billig proteinkälla som ägg, tonfisk, bönor eller kvarg.'
  }

  if (!hasVegetables) {
    return 'Nästa måltid: lägg till frysta grönsaker, morötter eller frukt.'
  }

  return 'Nästa måltid: fortsätt med samma enkla bas och håll portionen lagom.'
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
  const todaysPhotoMeals = getTodaysPhotoMeals(displayPhotoMeals)
  const mealCount = meals.length + todaysPhotoMeals.length
  const hasProtein = hasProteinToday(meals, todaysPhotoMeals)
  const hasVegetables = hasVegetablesToday(meals, todaysPhotoMeals)
  const bestMeal = getBestMeal(todaysPhotoMeals)
  const nextMealTip = getNextMealTip(hasProtein, hasVegetables)
  const dailySummary = getDailyMealSummary({
    hasProtein,
    hasVegetables,
    mealCount,
    photoMeals: todaysPhotoMeals,
  })

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
          aria-label="Välj måltidstyp"
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
          aria-label="Skriv måltidsnotering"
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
            <span>AI-sammanfattning</span>
            <strong>Dagens mat</strong>
          </div>
        </div>
        <p className="estimate-note">{dailySummary}</p>
        <p className="estimate-note">
          Proteinstatus:{' '}
          {hasProtein
            ? 'ser okej ut i dagens logg.'
            : 'syns inte tydligt ännu.'}
        </p>
        <p className="estimate-note">
          Grönsaksstatus:{' '}
          {hasVegetables
            ? 'grönsaker eller frukt verkar finnas med.'
            : 'lägg gärna till något grönt.'}
        </p>
        <p className="estimate-note">
          Fiber/kolhydratbalans:{' '}
          {bestMeal?.analysis?.fiberCarbBalance ||
            'välj gärna fullkorn, potatis, frukt eller grönsaker för mer fiber.'}
        </p>
        <p className="estimate-note">
          Enkel portionsbedömning:{' '}
          {bestMeal?.analysis?.portionEstimate ||
            'ingen tydlig bildbedömning ännu.'}
        </p>
        <p className="estimate-note">
          Dagens bästa måltid:{' '}
          {bestMeal?.summary || 'analysera en måltidsbild för att välja en.'}
        </p>
        <p className="estimate-note">
          Dagens förbättringsområde:{' '}
          {bestMeal?.improvementSuggestion || nextMealTip}
        </p>
        <p className="estimate-note">
          Billigt nästa måltidsförslag:{' '}
          {bestMeal?.analysis?.cheapNextMealSuggestion || nextMealTip}
        </p>
      </div>

      <div className="chart-card">
        <div className="chart-toolbar">
          <div>
            <span>Dagens mat</span>
            <strong>
              {mealCount} måltid{mealCount === 1 ? '' : 'er'} registrerade idag.
            </strong>
          </div>
        </div>
        <p className="estimate-note">
          {hasProtein
            ? 'Protein verkar finnas med i dagens måltider.'
            : 'Protein syns inte tydligt i dagens måltider ännu.'}
        </p>
        <p className="estimate-note">{nextMealTip}</p>
      </div>

      <MealList meals={meals} />
    </article>
  )
}

export default MealLogger
