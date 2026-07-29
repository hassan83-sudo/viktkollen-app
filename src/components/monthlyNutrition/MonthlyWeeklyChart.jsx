import { useState } from 'react'

function formatValue(value, mode) {
  const unit = mode === 'protein' ? 'g protein' : 'kcal'
  return `${Math.round(Number.isFinite(value) ? value : 0).toLocaleString('sv-SE')} ${unit}`
}

function MonthlyWeeklyChart({ weeks }) {
  const [mode, setMode] = useState('protein')
  const values = weeks.map((week) => week.registeredDays ? (mode === 'protein' ? week.proteinAverage : week.caloriesAverage) : 0)
  const maxValue = Math.max(...values, 1)

  return (
    <section className="nutrition-card monthly-nutrition-section">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Veckovis utveckling</p>
          <h3>{mode === 'protein' ? 'Protein per vecka' : 'Kalorier per vecka'}</h3>
        </div>
        <div className="segmented-control monthly-nutrition-toggle" aria-label="Välj månadsgraf">
          <button aria-pressed={mode === 'protein'} className={mode === 'protein' ? 'active' : ''} type="button" onClick={() => setMode('protein')}>Protein</button>
          <button aria-pressed={mode === 'calories'} className={mode === 'calories' ? 'active' : ''} type="button" onClick={() => setMode('calories')}>Kalorier</button>
        </div>
      </div>
      <div className="monthly-week-chart" role="list">
        {weeks.map((week, index) => {
          const value = values[index]
          const height = week.registeredDays ? Math.max(5, Math.round((value / maxValue) * 100)) : 0
          return (
            <div
              aria-label={week.registeredDays ? `Vecka ${index + 1}: ${formatValue(value, mode)}` : `Vecka ${index + 1}: ingen registrerad mat`}
              className={`monthly-week-bar ${week.registeredDays ? 'has-data' : 'is-missing'}`}
              key={week.startDate}
              role="listitem"
            >
              <div className="monthly-week-track"><span style={{ height: `${height}%` }} /></div>
              <strong>V{index + 1}</strong>
              <small>{week.registeredDays ? formatValue(value, mode) : 'Saknas'}</small>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default MonthlyWeeklyChart
