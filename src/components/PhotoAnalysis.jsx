function PhotoAnalysis({
  displayPhotoMeals,
  foodPhotoPreview,
  handleFoodPhotoChange,
  onAnalyzePhotoMeal,
  photoAnalysisStatus,
}) {
  return (
    <>
      <div className="photo-meal-tool">
        <div>
          <p className="eyebrow">Matfoto</p>
          <h3>Matfotoanalys V2</h3>
          <p>
            Ta eller välj en tydlig bild av måltiden. Du kan analysera flera
            måltidsbilder samma dag och följa dem i lokal historik. Analysen är
            en trygg uppskattning, inte exakta kalorier eller näringsvärden.
          </p>
        </div>
        <label className="photo-input">
          <span>Välj eller ta bild</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Välj eller ta en måltidsbild"
            onChange={handleFoodPhotoChange}
          />
        </label>
        {foodPhotoPreview && (
          <img
            className="food-preview"
            src={foodPhotoPreview}
            alt="Förhandsvisning av måltid"
          />
        )}
        <button
          type="button"
          disabled={!foodPhotoPreview}
          aria-label="Analysera vald måltidsbild"
          onClick={onAnalyzePhotoMeal}
        >
          Uppskatta måltiden
        </button>
        {photoAnalysisStatus && (
          <p className="analysis-status">{photoAnalysisStatus}</p>
        )}
        <p className="estimate-note">
          Se resultatet som en hjälpsam uppskattning. Bildanalys kan missa
          mängder, ingredienser och tillagning, så använd svaret som stöd och
          inte som exakt näringsdeklaration eller medicinsk rådgivning.
        </p>
      </div>

      {displayPhotoMeals.length > 0 && (
        <ul className="photo-meal-list">
          {displayPhotoMeals.map((entry) => (
            <li key={entry.id}>
              <img src={entry.image} alt="Analyserad måltid" />
              <div className="photo-meal-result">
                <strong>Uppskattad måltidsanalys</strong>
                <p>{entry.summary}</p>

                <div className="photo-meal-detected">
                  <div>
                    <span>Proteinstatus</span>
                    <strong>{entry.analysis.proteinStatus}</strong>
                  </div>
                  <div>
                    <span>Grönsaksstatus</span>
                    <strong>{entry.analysis.vegetableStatus}</strong>
                  </div>
                  <div>
                    <span>Fiber/kolhydratbalans</span>
                    <strong>{entry.analysis.fiberCarbBalance}</strong>
                  </div>
                </div>

                <div className="photo-meal-feedback">
                  <p>
                    <strong>Portion:</strong> {entry.analysis.portionEstimate}
                  </p>
                  <p>
                    <strong>Det ser bra ut:</strong> {entry.positiveFeedback}
                  </p>
                  <p>
                    <strong>Om du vill förbättra:</strong>{' '}
                    {entry.improvementSuggestion}
                  </p>
                  <p>
                    <strong>Billigt nästa mål:</strong>{' '}
                    {entry.analysis.cheapNextMealSuggestion}
                  </p>
                </div>

                <dl>
                  <div>
                    <dt>Energi, uppskattat</dt>
                    <dd>{entry.analysis.calories} kcal</dd>
                  </div>
                  <div>
                    <dt>Protein, uppskattat</dt>
                    <dd>{entry.analysis.protein} g</dd>
                  </div>
                  <div>
                    <dt>Kolhydrater, uppskattat</dt>
                    <dd>{entry.analysis.carbs} g</dd>
                  </div>
                  <div>
                    <dt>Tillförlitlighet</dt>
                    <dd>{entry.analysis.confidence}</dd>
                  </div>
                </dl>
                <p>{entry.analysis.explanation}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export default PhotoAnalysis
