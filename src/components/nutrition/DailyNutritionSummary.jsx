import { formatCalories, formatGrams } from '../../services/healthFormatting.js'

function formatNumber(value, unit) {
  return unit === 'kcal' ? formatCalories(value, { fallback: '0 kcal' }) : formatGrams(value, { fallback: `0 ${unit}`, unit })
}

function ProgressRow({ label, progress, unit, value }) {
  const percent = Number.isFinite(progress?.percent) ? progress.percent : null
  const visualPercent = Number.isFinite(progress?.visualPercent)
    ? Math.max(0, Math.min(progress.visualPercent, 100))
    : 0
  const status = progress?.status || 'missing'
  const progressLabel = percent === null ? 'Inget mål satt' : `${percent} procent`

  return (
    <div className={`nutrition-progress is-${status}`}>
      <div>
        <span>{label}</span>
        <strong>{formatNumber(value, unit)}</strong>
      </div>
      <div className="nutrition-progress-bar" aria-label={`${label}: ${progressLabel}`}>
        <span style={{ width: `${visualPercent}%` }}></span>
      </div>
      <small>{percent === null ? 'Inget mål satt' : `${percent}% - ${label}`}</small>
    </div>
  )
}

function DailyNutritionSummary({ summary }) {
  return (
    <section className="nutrition-card">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Daglig näringsöversikt</p>
          <h3>{summary.mealCount} registrerade måltider</h3>
        </div>
      </div>
      <div className="nutrition-stat-grid">
        <div><span>Kalorier</span><strong>{formatNumber(summary.totals.calories, 'kcal')}</strong></div>
        <div><span>Protein</span><strong>{formatNumber(summary.totals.protein, 'g')}</strong></div>
        <div><span>Kolhydrater</span><strong>{formatNumber(summary.totals.carbs, 'g')}</strong></div>
        <div><span>Fett</span><strong>{formatNumber(summary.totals.fat, 'g')}</strong></div>
        <div><span>Fibrer</span><strong>{formatNumber(summary.totals.fiber, 'g')}</strong></div>
      </div>
      <div className="nutrition-progress-list">
        <ProgressRow label="Kalorier" progress={summary.progress.calories} unit="kcal" value={summary.totals.calories} />
        <ProgressRow label="Protein" progress={summary.progress.protein} unit="g" value={summary.totals.protein} />
        <ProgressRow label="Fibrer" progress={summary.progress.fiber} unit="g" value={summary.totals.fiber} />
      </div>
      <div className="nutrition-mini-list">
        <span>Största måltid: {summary.largestMeal?.name || 'Saknas'}</span>
        <span>Proteinrikast: {summary.highestProteinMeal?.name || 'Saknas'}</span>
        <span>Fördelning: {summary.byType.filter((item) => item.count > 0).map((item) => `${item.type} ${item.count}`).join(', ') || 'Inga måltider'}</span>
      </div>
    </section>
  )
}

export default DailyNutritionSummary
