import { useState } from 'react'

function MealTimelineCard({ hasMeals, rows }) {
  const [expandedRows, setExpandedRows] = useState([])

  function toggleRow(id) {
    setExpandedRows((current) =>
      current.includes(id) ? current.filter((entryId) => entryId !== id) : [...current, id],
    )
  }

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
          {rows.map((row) => {
            const expanded = expandedRows.includes(row.id)

            return (
              <article key={row.id}>
                <div>
                  <span className="nutrition-pill">
                    {row.mealType}{row.time ? ` · ${row.time}` : ''}
                  </span>
                  <h4>{row.description}</h4>
                  <p>
                    {row.showApproxProtein ? '≈ ' : ''}{row.proteinText} protein ·{' '}
                    {row.showApproxCalories ? '≈ ' : ''}{row.caloriesText}
                  </p>
                </div>
                <div className="nutrition-dashboard-status">
                  <strong>{row.status.label}</strong>
                  {row.status.detail && <span>{row.status.detail}</span>}
                  <button
                    aria-expanded={expanded}
                    className="secondary-button"
                    type="button"
                    onClick={() => toggleRow(row.id)}
                  >
                    {expanded ? 'Dölj tips' : 'Visa tips'}
                  </button>
                  {expanded && row.status.tips?.length > 0 && (
                    <ul>
                      {row.status.tips.map((tip) => <li key={tip}>{tip}</li>)}
                    </ul>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default MealTimelineCard
