function MealTimelineCard({ hasMeals, rows }) {
  return (
    <section className="nutrition-card nutrition-dashboard-card">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Dagens tidslinje</p>
          <h3>Måltider i ordning</h3>
        </div>
      </div>

      {!hasMeals ? (
        <div className="nutrition-empty">
          <strong>Du har inte registrerat någon måltid idag.</strong>
          <span>Lägg till en måltid i Måltidscenter så uppdateras översikten direkt.</span>
        </div>
      ) : (
        <div className="nutrition-dashboard-timeline">
          {rows.map((row) => (
            <article key={row.id}>
              <div>
                <span className="nutrition-pill">
                  {row.mealType}{row.time ? ` · ${row.time}` : ''}
                </span>
                <h4>{row.description}</h4>
                <p>≈ {row.proteinText} protein · ≈ {row.caloriesText}</p>
              </div>
              <div className="nutrition-dashboard-status">
                <strong>{row.status.label}</strong>
                {row.status.detail && <span>{row.status.detail}</span>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default MealTimelineCard
