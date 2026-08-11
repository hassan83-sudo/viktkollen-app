import { memo, useMemo, useState } from 'react'
import { buildWeeklyProgress, isFiniteValue } from '../../services/dashboard/weeklyProgressModel.js'

const chartOptions = [
  { id: 'weight', label: 'Vikt', unit: 'kg' },
  { id: 'healthScore', label: 'Health Score', unit: '' },
  { id: 'calories', label: 'Kalorier', unit: 'kcal' },
  { id: 'protein', label: 'Protein', unit: 'g' },
  { id: 'steps', label: 'Steg', unit: '' },
]

function formatDecimal(value, unit = '') {
  if (!isFiniteValue(value)) return 'Saknas'

  const formatted = Number(value).toLocaleString('sv-SE', {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 1,
  })

  return unit ? `${formatted} ${unit}` : formatted
}

function formatSignedKg(value) {
  if (!isFiniteValue(value)) return 'För lite data'

  const number = Number(value)
  const prefix = number > 0 ? '+' : ''

  return `${prefix}${number.toFixed(1).replace('.', ',')} kg`
}

function getChartSeries(days, key) {
  const values = days.map((day) => day[key]).filter(isFiniteValue).map(Number)

  if (!values.length) {
    return { points: [], polyline: '' }
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const points = days
    .map((day, index) => {
      if (!isFiniteValue(day[key])) return null

      const x = 12 + index * 26
      const y = 92 - ((Number(day[key]) - min) / range) * 64

      return { date: day.date, x, y }
    })
    .filter(Boolean)

  return {
    points,
    polyline: points.map((point) => `${point.x},${point.y}`).join(' '),
  }
}

function WeeklyProgressSection({
  checkIn,
  foods,
  healthSnapshot,
  meals,
  nutritionGoals,
  selectedDate,
}) {
  const [activeChart, setActiveChart] = useState('weight')
  const model = useMemo(
    () =>
      buildWeeklyProgress({
        checkIn,
        foods,
        healthSnapshot,
        meals,
        nutritionGoals,
        selectedDate,
      }),
    [checkIn, foods, healthSnapshot, meals, nutritionGoals, selectedDate],
  )
  const activeOption = chartOptions.find((option) => option.id === activeChart) || chartOptions[0]
  const chartSeries = getChartSeries(model.days, activeOption.id)
  const hasAnyHistory = chartOptions.some((option) =>
    model.days.some((day) => isFiniteValue(day[option.id])),
  )

  return (
    <section className="weekly-progress-card" aria-label="Den här veckan">
      <div className="weekly-progress-heading">
        <div>
          <p className="eyebrow">Senaste 7 dagarna</p>
          <h2>Den här veckan</h2>
        </div>
        <span>{model.coverage.protein ? `${model.proteinGoalDays} dagar proteinmål` : 'Proteinmål saknas'}</span>
      </div>

      {!hasAnyHistory ? (
        <div className="weekly-progress-empty">
          <strong>Veckohistorik saknas ännu.</strong>
          <span>Logga vikt, måltider eller check-in några dagar så visas trenden här.</span>
        </div>
      ) : (
        <>
          <div className="weekly-progress-summary">
            <div><span>Vikttrend</span><strong>{formatSignedKg(model.weightTrend)}</strong></div>
            <div>
              <span>Health Score snitt</span>
              <strong>{model.coverage.healthScore ? `${formatDecimal(model.averageHealthScore)}/100` : 'För lite data'}</strong>
              <small>{model.coverage.healthScore} av 7 dagar med data</small>
            </div>
            <div><span>Steg snitt</span><strong>{formatDecimal(model.averageSteps)}</strong></div>
            <div>
              <span>Proteinmål</span>
              <strong>{model.coverage.protein ? `${model.proteinGoalDays} dagar` : 'För lite data'}</strong>
            </div>
          </div>

          <div className="weekly-progress-toggle" aria-label="Välj trendgraf">
            {chartOptions.map((option) => (
              <button
                aria-pressed={activeChart === option.id}
                className={activeChart === option.id ? 'is-active' : ''}
                key={option.id}
                type="button"
                onClick={() => setActiveChart(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="weekly-progress-chart" aria-label={`${activeOption.label} senaste 7 dagarna`}>
            {chartSeries.polyline ? (
              <svg viewBox="0 0 180 110" role="img" aria-hidden="true">
                <polyline points={chartSeries.polyline} />
                {chartSeries.points.map((point) => (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    key={point.date}
                    r="3.5"
                  />
                ))}
              </svg>
            ) : (
              <div className="weekly-progress-empty compact">
                <strong>För lite data för {activeOption.label.toLocaleLowerCase('sv-SE')}.</strong>
                <span>Välj en annan trend eller fyll på data under veckan.</span>
              </div>
            )}
          </div>

          <ol className="weekly-progress-days" aria-label="Dagliga värden">
            {model.days.map((day) => (
              <li key={day.date}>
                <span>{day.label}</span>
                <strong>{formatDecimal(day[activeOption.id], activeOption.unit)}</strong>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}

export default memo(WeeklyProgressSection)
