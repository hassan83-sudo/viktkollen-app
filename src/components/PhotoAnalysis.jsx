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
            Ta eller välj en tydlig bild av måltiden. Analysen ger en trygg
            uppskattning av innehållet, inte exakta kalorier eller
            näringsvärden.
          </p>
        </div>
        <label className="photo-input">
          <span>Välj eller ta bild</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
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
                    <span>Trolig proteinkälla</span>
                    <strong>{entry.likelyProtein}</strong>
                  </div>
                  <div>
                    <span>Troliga grönsaker</span>
                    <strong>{entry.likelyVegetables}</strong>
                  </div>
                  <div>
                    <span>Trolig kolhydratkälla</span>
                    <strong>{entry.likelyCarbs}</strong>
                  </div>
                </div>

                <div className="photo-meal-feedback">
                  <p>
                    <strong>Det ser bra ut:</strong> {entry.positiveFeedback}
                  </p>
                  <p>
                    <strong>Om du vill förbättra:</strong> {entry.improvementSuggestion}
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
