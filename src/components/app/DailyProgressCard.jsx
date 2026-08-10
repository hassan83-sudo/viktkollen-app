function formatNumber(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return '–'
  }

  return new Intl.NumberFormat('sv-SE').format(Math.round(number))
}

function formatWeightChange(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return '–'
  }

  const prefix = number > 0 ? '+' : ''

  return `${prefix}${number.toFixed(1).replace('.', ',')} kg`
}

function getProgress(value, goal) {
  const current = Number(value)
  const target = Number(goal)

  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) {
    return 0
  }

  return Math.min((current / target) * 100, 100)
}

function getProgressTone(progress) {
  if (progress >= 90) return 'is-strong'
  if (progress >= 65) return 'is-steady'
  return 'is-low'
}

function DailyProgressCard({
  caloriesToday,
  calorieGoal,
  healthScore,
  proteinToday,
  proteinGoal,
  steps,
  weeklyWeightChange,
}) {
  const calorieProgress = getProgress(caloriesToday, calorieGoal)
  const proteinProgress = getProgress(proteinToday, proteinGoal)

  return (
    <section className="daily-progress-card" aria-label="Dagens framsteg">
      <div className="daily-progress-heading">
        <div>
          <p className="eyebrow">Idag</p>
          <h2>Dagens framsteg</h2>
        </div>

        <div className="daily-progress-score">
          <span>Health Score</span>
          <strong>
            {Number.isFinite(Number(healthScore))
              ? `${Math.round(Number(healthScore))}/100`
              : '–'}
          </strong>
        </div>
      </div>

      <div className="daily-progress-grid">
        <div className="daily-progress-item">
          <span>🔥 Kalorier</span>

          <strong>
            {Number.isFinite(Number(caloriesToday))
              ? `${formatNumber(caloriesToday)} kcal`
              : '–'}
          </strong>

          <div className={`progress-bar ${getProgressTone(calorieProgress)}`}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${calorieProgress}%`,
              }}
            />
          </div>

          {Number.isFinite(Number(calorieGoal)) && (
            <small>
              <span>{Math.round(calorieProgress)} %</span>
              av {formatNumber(calorieGoal)} kcal
            </small>
          )}
        </div>

        <div className="daily-progress-item">
          <span>🥩 Protein</span>

          <strong>
            {Number.isFinite(Number(proteinToday))
              ? `${formatNumber(proteinToday)} g`
              : '–'}
          </strong>

          <div className={`progress-bar ${getProgressTone(proteinProgress)}`}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${proteinProgress}%`,
              }}
            />
          </div>

          {Number.isFinite(Number(proteinGoal)) && (
            <small>
              <span>{Math.round(proteinProgress)} %</span>
              av {formatNumber(proteinGoal)} g
            </small>
          )}
        </div>

        <div className="daily-progress-item">
          <span>👣 Steg</span>
          <strong>{formatNumber(steps)}</strong>
          <small>idag</small>
        </div>

        <div className="daily-progress-item">
          <span>⚖️ Veckan</span>
          <strong>{formatWeightChange(weeklyWeightChange)}</strong>
          <small>viktförändring</small>
        </div>
      </div>
    </section>
  )
}

export default DailyProgressCard
