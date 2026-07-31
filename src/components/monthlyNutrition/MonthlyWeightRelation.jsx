import { formatWeight, formatWeightChange } from '../../services/healthFormatting.js'

function formatChange(change) {
  return Number.isFinite(change) ? formatWeightChange(change, { showPlus: true }) : ''
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
            <strong>{formatWeight(relation.startWeight)}</strong>
          </article>
          <article>
            <span>Slut</span>
            <strong>{formatWeight(relation.endWeight)}</strong>
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
