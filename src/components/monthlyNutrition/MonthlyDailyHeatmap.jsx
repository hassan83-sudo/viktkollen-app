function formatMacro(day) {
  if (day.isFuture) return 'Framtida dag'
  if (!day.hasData) return 'Ingen registrerad mat'

  return `${Math.round(day.totals.protein).toLocaleString('sv-SE')} g protein, ${Math.round(day.totals.calories).toLocaleString('sv-SE')} kcal`
}

function getCellClass(day) {
  if (day.isFuture) return 'is-future'
  if (!day.hasData) return 'is-empty'
  if (day.proteinGoalStatus?.status === 'reached') return 'is-strong'
  if (day.proteinGoalStatus?.status === 'near') return 'is-near'
  return 'has-data'
}

function MonthlyDailyHeatmap({ days }) {
  return (
    <section className="nutrition-card monthly-nutrition-section">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Dagar</p>
          <h3>Månadens registreringar</h3>
        </div>
      </div>
      <div className="monthly-daily-grid" role="list" aria-label="Månadens registrerade matdagar">
        {days.map((day) => (
          <div
            aria-label={`${day.date}: ${formatMacro(day)}`}
            className={`monthly-day-cell ${getCellClass(day)}`}
            key={day.date}
            role="listitem"
            title={`${day.date}: ${formatMacro(day)}`}
          >
            <span>{day.dayOfMonth}</span>
            <small>{day.hasData ? day.mealCount : ''}</small>
          </div>
        ))}
      </div>
    </section>
  )
}

export default MonthlyDailyHeatmap
