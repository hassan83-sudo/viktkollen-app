import PhotoAnalysis from './PhotoAnalysis.jsx'

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

      <ul className="meal-list">
        {meals.map((meal) => (
          <li key={meal.id}>
            <strong>{meal.type}</strong>
            <span>{meal.text}</span>
          </li>
        ))}
      </ul>
    </article>
  )
}

export default MealLogger
