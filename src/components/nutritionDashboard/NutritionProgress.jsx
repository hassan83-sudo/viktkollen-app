function NutritionProgress({ progress }) {
  if (!progress.hasGoal) {
    return null
  }

  const percent = Number.isFinite(progress.percent) ? progress.percent : null
  const visualPercent = Number.isFinite(progress.visualPercent)
    ? Math.max(0, Math.min(progress.visualPercent, 100))
    : 0
  const progressText = percent === null ? 'Inget mål satt' : `${percent} procent`

  return (
    <div className={`nutrition-dashboard-progress is-${progress.status}`}>
      <div>
        <span>{progress.label}</span>
        <strong>{progress.valueText} av {progress.goalText}</strong>
      </div>
      <div
        aria-label={`${progress.label}: ${progress.valueText} av ${progress.goalText}, ${progress.status === 'reached' ? 'målet uppnått' : progressText}`}
        className="nutrition-dashboard-progress-bar"
        role="img"
      >
        <span style={{ width: `${visualPercent}%` }}></span>
      </div>
      <small>{progress.status === 'reached' ? 'Målet uppnått' : `${percent ?? 0} % · ${progress.text}`}</small>
    </div>
  )
}

export default NutritionProgress
