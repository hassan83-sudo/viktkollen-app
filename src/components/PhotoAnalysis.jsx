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
            Ladda upp eller ta en bild. Analysen försöker hitta trolig
            proteinkälla, grönsaker och kolhydratkälla utan exakta
            näringsvärden.
          </p>
        </div>
        <label className="photo-input">
          <span>Välj matfoto</span>
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
          Analysera måltid
        </button>
        {photoAnalysisStatus && (
          <p className="analysis-status">{photoAnalysisStatus}</p>
        )}
        <p className="estimate-note">
          Endast försiktig bildtolkning från AI eller lokal fallback. Ingen
          medicinsk rådgivning, exakt kaloriberäkning eller exakt
          näringsdeklaration.
        </p>
      </div>

      {displayPhotoMeals.length > 0 && (
        <ul className="photo-meal-list">
          {displayPhotoMeals.map((entry) => (
            <li key={entry.id}>
              <img src={entry.image} alt="Analyserad måltid" />
              <div className="photo-meal-result">
                <strong>Matfotoanalys V2</strong>
                <p>{entry.summary}</p>

                <div className="photo-meal-detected">
                  <div>
                    <span>Proteinkälla</span>
                    <strong>{entry.likelyProtein}</strong>
                  </div>
                  <div>
                    <span>Grönsaker</span>
                    <strong>{entry.likelyVegetables}</strong>
                  </div>
                  <div>
                    <span>Kolhydratkälla</span>
                    <strong>{entry.likelyCarbs}</strong>
                  </div>
                </div>

                <div className="photo-meal-feedback">
                  <p>
                    <strong>Positivt:</strong> {entry.positiveFeedback}
                  </p>
                  <p>
                    <strong>Nästa steg:</strong> {entry.improvementSuggestion}
                  </p>
                </div>

                <dl>
                  <div>
                    <dt>Energi, grovt</dt>
                    <dd>{entry.analysis.calories} kcal</dd>
                  </div>
                  <div>
                    <dt>Protein, grovt</dt>
                    <dd>{entry.analysis.protein} g</dd>
                  </div>
                  <div>
                    <dt>Kolhydrater, grovt</dt>
                    <dd>{entry.analysis.carbs} g</dd>
                  </div>
                  <div>
                    <dt>Säkerhet</dt>
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
