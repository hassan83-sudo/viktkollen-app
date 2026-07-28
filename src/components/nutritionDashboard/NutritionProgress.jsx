function NutritionProgress({ progress }) {
  if (!progress.hasGoal) {
    return null
  }

  return (
    <div className={`nutrition-dashboard-progress is-${progress.status}`}>
      <div>
        <span>{progress.label}</span>
        <strong>{progress.valueText} av {progress.goalText}</strong>
      </div>
      <div
        aria-label={`${progress.label}: ${progress.valueText} av ${progress.goalText}, ${progress.status === 'reached' ? 'målet uppnått' : `${progress.percent} procent`}`}
        className="nutrition-dashboard-progress-bar"
        role="img"
      >
        <span style={{ width: `${progress.visualPercent}%` }}></span>
      </div>
      <small>{progress.status === 'reached' ? 'Målet uppnått' : `${progress.percent} % · ${progress.text}`}</small>
    </div>
  )
}

export default NutritionProgress
