import { memo, useMemo, useState } from 'react'
import { calculateAiHealthScore } from '../../services/dashboardService.js'
import { getEntryLocalDate } from '../../services/localDate.js'
import { addDays, getTodayDateString, summarizeDay } from '../../services/nutritionService.js'

const chartOptions = [
  { id: 'weight', label: 'Vikt', unit: 'kg' },
  { id: 'healthScore', label: 'Health Score', unit: '' },
  { id: 'calories', label: 'Kalorier', unit: 'kcal' },
  { id: 'protein', label: 'Protein', unit: 'g' },
  { id: 'steps', label: 'Steg', unit: '' },
]

function isFiniteValue(value) {
  return Number.isFinite(Number(value))
}

function formatDecimal(value, unit = '') {
  if (!isFiniteValue(value)) return 'Saknas'

  const formatted = Number(value).toLocaleString('sv-SE', {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 1,
  })

  return unit ? `${formatted} ${unit}` : formatted
}

function formatSignedKg(value) {
  if (!isFiniteValue(value)) return 'Saknas'

  const number = Number(value)
  const prefix = number > 0 ? '+' : ''

  return `${prefix}${number.toFixed(1).replace('.', ',')} kg`
}

function getDateLabel(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${date}T12:00:00`))
}

function getLatestWeightByDate(dailyWeights = []) {
  return new Map(
    (Array.isArray(dailyWeights) ? dailyWeights : [])
      .filter((entry) => entry?.date && isFiniteValue(entry.value))
      .map((entry) => [entry.date, Number(entry.value)]),
  )
}

function getCheckInByDate(entries = [], fallbackCheckIn = {}, todayDate = '') {
  const map = new Map(
    (Array.isArray(entries) ? entries : [])
      .filter(Boolean)
      .map((entry) => [getEntryLocalDate(entry), entry])
      .filter(([date]) => date),
  )

  if (todayDate && fallbackCheckIn && typeof fallbackCheckIn === 'object') {
    map.set(todayDate, {
      ...fallbackCheckIn,
      date: fallbackCheckIn.date || todayDate,
    })
  }

  return map
}

function getAverage(values) {
  const finiteValues = values.filter(isFiniteValue).map(Number)

  if (!finiteValues.length) return null

  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length
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

function buildWeeklyProgress({
  checkIn,
  foods,
  healthSnapshot,
  meals,
  nutritionGoals,
  selectedDate,
}) {
  const endDate = healthSnapshot?.date || selectedDate || getTodayDateString()
  const dates = Array.from({ length: 7 }, (_, index) => addDays(endDate, index - 6))
  const weightsByDate = getLatestWeightByDate(healthSnapshot?.weight?.dailyWeights)
  const checkInsByDate = getCheckInByDate(
    healthSnapshot?.checkIn?.dailyEntries,
    checkIn,
    healthSnapshot?.date,
  )

  const days = dates.map((date) => {
    const nutrition = summarizeDay(meals, date, nutritionGoals)
    const dayMeals = nutrition.meals || []
    const dayCheckIn = checkInsByDate.get(date) || null
    const weight = weightsByDate.get(date) ?? null
    const hasHealthSignals = Boolean(dayCheckIn || dayMeals.length || weight !== null)
    const healthScore = hasHealthSignals
      ? calculateAiHealthScore({
        checkIn: dayCheckIn || {},
        foods: date === healthSnapshot?.date ? foods : [],
        meals: dayMeals,
        weights: (healthSnapshot?.weight?.dailyWeights || [])
          .filter((entry) => entry.date <= date),
      }).score
      : null
    const proteinGoal = Number(nutrition.goals?.protein)

    return {
      calories: isFiniteValue(nutrition.totals?.calories)
        ? Number(nutrition.totals.calories)
        : null,
      date,
      healthScore,
      label: getDateLabel(date),
      protein: isFiniteValue(nutrition.totals?.protein)
        ? Number(nutrition.totals.protein)
        : null,
      proteinGoalReached:
        Number.isFinite(proteinGoal) &&
        proteinGoal > 0 &&
        Number(nutrition.totals?.protein || 0) >= proteinGoal,
      steps: isFiniteValue(dayCheckIn?.steps) ? Number(dayCheckIn.steps) : null,
      weight,
    }
  })
  const weights = days.map((day) => day.weight).filter(isFiniteValue).map(Number)
  const weightTrend = weights.length >= 2
    ? Number((weights.at(-1) - weights[0]).toFixed(1))
    : null

  return {
    averageHealthScore: getAverage(days.map((day) => day.healthScore)),
    averageSteps: getAverage(days.map((day) => day.steps)),
    days,
    proteinGoalDays: days.filter((day) => day.proteinGoalReached).length,
    weightTrend,
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
        <span>{model.proteinGoalDays}/7 proteinmål</span>
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
            <div><span>Health Score snitt</span><strong>{formatDecimal(model.averageHealthScore)}</strong></div>
            <div><span>Steg snitt</span><strong>{formatDecimal(model.averageSteps)}</strong></div>
            <div><span>Proteinmål</span><strong>{model.proteinGoalDays} dagar</strong></div>
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
                <strong>Ingen data för {activeOption.label.toLocaleLowerCase('sv-SE')}.</strong>
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
