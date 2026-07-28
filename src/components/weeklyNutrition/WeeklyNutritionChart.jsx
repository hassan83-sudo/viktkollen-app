import { useState } from 'react'

function formatValue(value, mode) {
  const unit = mode === 'protein' ? 'g protein' : 'kcal'

  return `${Math.round(Number.isFinite(value) ? value : 0).toLocaleString('sv-SE')} ${unit}`
}

function getGoal(summary, mode) {
  if (mode === 'protein') {
    return summary.days.find((day) => day.summary.proteinGoal)?.summary.proteinGoal?.target || null
  }

  return summary.days.find((day) => Number.isFinite(day.summary.caloriesGoal))?.summary.caloriesGoal || null
}

function WeeklyNutritionChart({ summary }) {
  const [mode, setMode] = useState('protein')
  const goal = getGoal(summary, mode)
  const values = summary.days.map((day) => day.hasData ? day.totals[mode === 'protein' ? 'protein' : 'calories'] : 0)
  const maxValue = Math.max(goal || 0, ...values, 1)

  return (
    <section className="nutrition-card weekly-nutrition-section">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Veckograf</p>
          <h3>{mode === 'protein' ? 'Protein per dag' : 'Kalorier per dag'}</h3>
        </div>
        <div className="segmented-control weekly-nutrition-toggle" aria-label="Välj graf">
          <button aria-pressed={mode === 'protein'} className={mode === 'protein' ? 'active' : ''} type="button" onClick={() => setMode('protein')}>
            Protein
          </button>
          <button aria-pressed={mode === 'calories'} className={mode === 'calories' ? 'active' : ''} type="button" onClick={() => setMode('calories')}>
            Kalorier
          </button>
        </div>
      </div>
      <div className="weekly-nutrition-chart" role="list">
        {summary.days.map((day, index) => {
          const value = values[index]
          const height = day.hasData ? Math.max(5, Math.round((value / maxValue) * 100)) : 0

          return (
            <div
              aria-label={day.hasData ? `${day.dayName}: ${formatValue(value, mode)}` : `${day.dayName}: ingen registrerad mat`}
              className={`weekly-nutrition-bar ${day.hasData ? 'has-data' : 'is-missing'}`}
              key={day.date}
              role="listitem"
            >
              <div className="weekly-nutrition-bar-track">
                {goal && <span className="weekly-nutrition-goal-line" style={{ bottom: `${Math.min(100, Math.round((goal / maxValue) * 100))}%` }} />}
                <span className="weekly-nutrition-bar-fill" style={{ height: `${height}%` }} />
              </div>
              <strong>{day.dayName.slice(0, 3)}</strong>
              <small>{day.hasData ? formatValue(value, mode) : 'Saknas'}</small>
            </div>
          )
        })}
      </div>
      {goal && <p className="settings-note">Mållinjen visar {formatValue(goal, mode)}.</p>}
    </section>
  )
}

export default WeeklyNutritionChart
