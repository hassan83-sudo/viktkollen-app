import { formatKg } from '../../services/healthCalculations.js'
import { formatProgressChange } from '../../services/progress/progressAnalytics.js'

function ProgressTrendCard({ weight }) {
  return (
    <section className="nutrition-card progress-card" aria-labelledby="progress-trend-title">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Viktutveckling</p>
          <h3 id="progress-trend-title">Trend</h3>
        </div>
        <span className="nutrition-pill">{weight.trendDirection === 'insufficient' ? 'Mer data behövs' : weight.trendDirection}</span>
      </div>
      {weight.registrationCount ? (
        <dl className="progress-detail-grid">
          <div><dt>Första i perioden</dt><dd>{formatKg(weight.firstWeight, { fallback: 'Saknas' })}</dd></div>
          <div><dt>Senaste i perioden</dt><dd>{formatKg(weight.latestWeight, { fallback: 'Saknas' })}</dd></div>
          <div><dt>Förändring</dt><dd>{formatProgressChange(weight.periodChangeKg ?? weight.changeKg)}</dd></div>
          <div><dt>Procent</dt><dd>{Number.isFinite(weight.percentChange) ? `${weight.percentChange.toLocaleString('sv-SE')}%` : 'Saknas'}</dd></div>
          <div><dt>Veckogenomsnitt</dt><dd>{weight.weeklyAverageChange === null ? 'Saknas' : formatProgressChange(weight.weeklyAverageChange)}</dd></div>
          <div><dt>Registreringar</dt><dd>{weight.registrationCount}</dd></div>
          <div><dt>Bästa loggstreak</dt><dd>{weight.bestLoggingStreak} dagar</dd></div>
        </dl>
      ) : (
        <div className="nutrition-empty">
          <strong>Ingen viktdata i perioden.</strong>
          <span>Logga vikt när du vill se periodtrend och prognos.</span>
        </div>
      )}
    </section>
  )
}

export default ProgressTrendCard
