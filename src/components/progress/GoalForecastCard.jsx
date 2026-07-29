import { formatKg } from '../../services/healthCalculations.js'

function GoalForecastCard({ forecast }) {
  return (
    <section className="nutrition-card progress-card" aria-labelledby="progress-forecast-title">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Målprognos</p>
          <h3 id="progress-forecast-title">Försiktig riktning</h3>
        </div>
        <span className="nutrition-pill">{forecast.confidence === 'insufficient' ? 'Osäkert' : forecast.confidence}</span>
      </div>
      <p>{forecast.text}</p>
      <dl className="progress-detail-grid">
        <div><dt>Trend per vecka</dt><dd>{Number.isFinite(forecast.weeklyRate) ? formatKg(forecast.weeklyRate) : 'Saknas'}</dd></div>
        <div><dt>Veckor kvar</dt><dd>{Number.isFinite(forecast.weeksRemaining) ? `${forecast.weeksRemaining} veckor` : 'Saknas'}</dd></div>
        <div><dt>Uppskattad månad</dt><dd>{forecast.estimatedMonth || 'Saknas'}</dd></div>
      </dl>
    </section>
  )
}

export default GoalForecastCard
