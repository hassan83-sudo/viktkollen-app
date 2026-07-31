function NutritionProgress({ progress }) {
  if (!progress.hasGoal) {
    return null
  }

  const progressId = `nutrition-dashboard-${String(progress.label || 'mal').toLocaleLowerCase('sv-SE')}`
  const percent = Number.isFinite(progress.percent) ? progress.percent : null
  const visualPercent = Number.isFinite(progress.visualPercent)
    ? Math.max(0, Math.min(progress.visualPercent, 100))
    : 0
  const progressText = percent === null ? 'Inget mål satt' : `${percent} procent`

  return (
    <div className={`nutrition-dashboard-progress is-${progress.status}`}>
      <div>
        <span id={`${progressId}-label`}>{progress.label}</span>
        <strong>{progress.valueText} av {progress.goalText}</strong>
      </div>
      <div
        aria-labelledby={`${progressId}-label`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={visualPercent}
        aria-valuetext={`${progress.valueText} av ${progress.goalText}, ${progress.status === 'reached' ? 'målet uppnått' : progressText}`}
        className="nutrition-dashboard-progress-bar"
        role="progressbar"
      >
        <span style={{ width: `${visualPercent}%` }}></span>
      </div>
      <small>{progress.status === 'reached' ? 'Målet uppnått' : `${percent ?? 0} % · ${progress.text}`}</small>
    </div>
  )
}

export default NutritionProgress
