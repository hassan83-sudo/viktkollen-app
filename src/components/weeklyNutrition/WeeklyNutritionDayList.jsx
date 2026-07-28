function formatMacro(value, unit) {
  return `${Math.round(Number.isFinite(value) ? value : 0).toLocaleString('sv-SE')} ${unit}`
}

function goalText(status) {
  return status?.label || 'Mål saknas'
}

function WeeklyNutritionDayList({ days }) {
  return (
    <section className="nutrition-card weekly-nutrition-section">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Daglig breakdown</p>
          <h3>Veckans dagar</h3>
        </div>
      </div>
      <div className="weekly-nutrition-day-list">
        {days.map((day) => (
          <article key={day.date}>
            <div>
              <span className="nutrition-pill">{day.dayName}</span>
              <h4>{day.date}</h4>
              {!day.hasData && <p>Ingen registrerad mat.</p>}
            </div>
            {day.hasData && (
              <dl>
                <div><dt>Kalorier</dt><dd>{formatMacro(day.totals.calories, 'kcal')}</dd></div>
                <div><dt>Protein</dt><dd>{formatMacro(day.totals.protein, 'g')}</dd></div>
                <div><dt>Måltider</dt><dd>{day.mealCount.toLocaleString('sv-SE')}</dd></div>
                <div><dt>Proteinmål</dt><dd>{goalText(day.proteinGoalStatus)}</dd></div>
                <div><dt>Kalorimål</dt><dd>{goalText(day.caloriesGoalStatus)}</dd></div>
              </dl>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

export default WeeklyNutritionDayList
