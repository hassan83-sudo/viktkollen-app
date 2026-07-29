function formatChange(change) {
  if (!Number.isFinite(change)) return ''
  if (change > 0) return `+${change.toLocaleString('sv-SE')} kg`
  return `${change.toLocaleString('sv-SE')} kg`
}

function MonthlyWeightRelation({ relation }) {
  const hasWeightChange = relation?.hasData && relation.weightCount >= 2

  return (
    <section className="nutrition-card monthly-nutrition-section">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Vikt och kost</p>
          <h3>Månadsrelation</h3>
        </div>
      </div>
      {hasWeightChange ? (
        <div className="monthly-weight-relation">
          <article>
            <span>Start</span>
            <strong>{relation.startWeight.toLocaleString('sv-SE')} kg</strong>
          </article>
          <article>
            <span>Slut</span>
            <strong>{relation.endWeight.toLocaleString('sv-SE')} kg</strong>
          </article>
          <article>
            <span>Förändring</span>
            <strong>{formatChange(relation.change)}</strong>
          </article>
          <p>{relation.text}</p>
        </div>
      ) : (
        <p className="monthly-empty-text">{relation?.text || 'Ingen giltig viktdata finns för månaden.'}</p>
      )}
    </section>
  )
}

export default MonthlyWeightRelation
