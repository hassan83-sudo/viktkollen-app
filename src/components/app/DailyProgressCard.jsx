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

function DailyProgressCard({
  caloriesToday,
  calorieGoal,
  healthScore,
  proteinToday,
  proteinGoal,
  steps,
  weeklyWeightChange,
}) {
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

          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{
                width: `${getProgress(caloriesToday, calorieGoal)}%`,
              }}
            />
          </div>

          {Number.isFinite(Number(calorieGoal)) && (
            <small>av {formatNumber(calorieGoal)} kcal</small>
          )}
        </div>

        <div className="daily-progress-item">
          <span>🥩 Protein</span>

          <strong>
            {Number.isFinite(Number(proteinToday))
              ? `${formatNumber(proteinToday)} g`
              : '–'}
          </strong>

          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{
                width: `${getProgress(proteinToday, proteinGoal)}%`,
              }}
            />
          </div>

          {Number.isFinite(Number(proteinGoal)) && (
            <small>av {formatNumber(proteinGoal)} g</small>
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