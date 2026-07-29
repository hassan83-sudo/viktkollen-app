import { useMemo, useState } from 'react'
import {
  buildWeeklyNutritionReport,
  weeklyNutritionInternals,
} from '../services/nutrition/nutritionEngine.js'
import WeeklyNutritionChart from './weeklyNutrition/WeeklyNutritionChart.jsx'
import WeeklyNutritionDayList from './weeklyNutrition/WeeklyNutritionDayList.jsx'
import WeeklyNutritionInsights from './weeklyNutrition/WeeklyNutritionInsights.jsx'
import WeeklyNutritionSummaryCards from './weeklyNutrition/WeeklyNutritionSummaryCards.jsx'
import NutritionQualitySummary from './nutritionDataQuality/NutritionQualitySummary.jsx'

function copyTextFallback(text) {
  if (typeof document === 'undefined') return false

  const element = document.createElement('textarea')

  element.value = text
  element.setAttribute('readonly', '')
  element.style.position = 'fixed'
  element.style.opacity = '0'
  document.body.appendChild(element)
  element.select()

  try {
    return document.execCommand('copy')
  } finally {
    document.body.removeChild(element)
  }
}

function WeeklyNutritionDashboard({
  date,
  meals,
  nutritionGoals,
  onDateChange,
}) {
  const [copyStatus, setCopyStatus] = useState('')
  const report = useMemo(
    () => buildWeeklyNutritionReport({ date, meals, nutritionGoals }),
    [date, meals, nutritionGoals],
  )
  const { summary } = report

  async function copySummary() {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(report.textSummary)
      } else if (!copyTextFallback(report.textSummary)) {
        throw new Error('copy failed')
      }

      setCopyStatus('Veckosammanfattningen kopierades.')
    } catch {
      setCopyStatus('Kunde inte kopiera veckosammanfattningen.')
    }
  }

  return (
    <section className="weekly-nutrition-dashboard" aria-labelledby="weekly-nutrition-title">
      <div className="nutrition-card weekly-nutrition-header">
        <div className="nutrition-card-heading">
          <div>
            <p className="eyebrow">Weekly Nutrition Dashboard</p>
            <h3 id="weekly-nutrition-title">{summary.startDate} till {summary.endDate}</h3>
          </div>
          <span className="nutrition-pill">{summary.coverage.label}</span>
        </div>
        <div className="weekly-nutrition-nav" aria-label="Veckonavigering">
          <button className="secondary-button" type="button" onClick={() => onDateChange(weeklyNutritionInternals.addDays(summary.startDate, -7))}>
            Föregående vecka
          </button>
          <button className="secondary-button" type="button" onClick={() => onDateChange(weeklyNutritionInternals.localDateString())}>
            Denna vecka
          </button>
          <button className="secondary-button" type="button" onClick={() => onDateChange(weeklyNutritionInternals.addDays(summary.startDate, 7))}>
            Nästa vecka
          </button>
          <button type="button" onClick={copySummary}>
            Kopiera veckosammanfattning
          </button>
        </div>
        {copyStatus && <p className="nutrition-edit-status" role="status">{copyStatus}</p>}
        <WeeklyNutritionSummaryCards summary={summary} />
      </div>

      <WeeklyNutritionChart summary={summary} />
      <NutritionQualitySummary quality={summary.quality} title="Veckans datakvalitet" />
      <WeeklyNutritionDayList days={summary.days} />
      <WeeklyNutritionInsights
        comparison={report.comparison}
        focus={report.focus}
        insights={report.insights}
        patterns={summary.patterns}
      />
    </section>
  )
}

export default WeeklyNutritionDashboard
