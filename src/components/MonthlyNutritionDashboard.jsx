import { useMemo, useState } from 'react'
import {
  buildMonthlyExportPayload,
  buildMonthlyNutritionReport,
  monthlyNutritionInternals,
} from '../services/nutrition/nutritionEngine.js'
import MonthlyDailyHeatmap from './monthlyNutrition/MonthlyDailyHeatmap.jsx'
import MonthlyInsights from './monthlyNutrition/MonthlyInsights.jsx'
import MonthlyPatterns from './monthlyNutrition/MonthlyPatterns.jsx'
import MonthlySummaryCards from './monthlyNutrition/MonthlySummaryCards.jsx'
import MonthlyWeeklyChart from './monthlyNutrition/MonthlyWeeklyChart.jsx'
import MonthlyWeightRelation from './monthlyNutrition/MonthlyWeightRelation.jsx'

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

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)
}

function MonthlyNutritionDashboard({
  date,
  meals,
  nutritionGoals,
  onDateChange,
  weights,
}) {
  const [copyStatus, setCopyStatus] = useState('')
  const report = useMemo(
    () => buildMonthlyNutritionReport({ date, meals, nutritionGoals, weights }),
    [date, meals, nutritionGoals, weights],
  )
  const { summary } = report

  async function copyReport() {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(report.textReport)
      } else if (!copyTextFallback(report.textReport)) {
        throw new Error('copy failed')
      }

      setCopyStatus('Månadsrapporten kopierades.')
    } catch {
      setCopyStatus('Kunde inte kopiera månadsrapporten.')
    }
  }

  function exportReport() {
    downloadJson(`viktkollen-manadsrapport-${summary.startDate.slice(0, 7)}.json`, buildMonthlyExportPayload(report))
  }

  return (
    <section className="monthly-nutrition-dashboard" aria-labelledby="monthly-nutrition-title">
      <div className="nutrition-card monthly-nutrition-header">
        <div className="nutrition-card-heading">
          <div>
            <p className="eyebrow">Monthly Nutrition Report</p>
            <h3 id="monthly-nutrition-title">{summary.label}</h3>
          </div>
          <span className="nutrition-pill">{summary.coverage.label}</span>
        </div>
        <div className="monthly-nutrition-nav" aria-label="Månadsnavigering">
          <button className="secondary-button" type="button" onClick={() => onDateChange(monthlyNutritionInternals.addMonths(summary.startDate, -1))}>
            Föregående månad
          </button>
          <button className="secondary-button" type="button" onClick={() => onDateChange(monthlyNutritionInternals.localDateString())}>
            Denna månad
          </button>
          <button className="secondary-button" type="button" onClick={() => onDateChange(monthlyNutritionInternals.addMonths(summary.startDate, 1))}>
            Nästa månad
          </button>
          <button type="button" onClick={copyReport}>
            Kopiera rapport
          </button>
          <button type="button" onClick={exportReport}>
            Exportera JSON
          </button>
        </div>
        {copyStatus && <p className="nutrition-edit-status" role="status">{copyStatus}</p>}
        <MonthlySummaryCards summary={summary} />
      </div>

      <MonthlyWeeklyChart weeks={summary.weeklyBreakdown} />
      <MonthlyDailyHeatmap days={summary.dailyBreakdown} />
      <MonthlyPatterns patterns={summary.patterns} />
      <MonthlyWeightRelation relation={summary.weightRelation} />
      <MonthlyInsights
        comparison={report.comparison}
        insights={summary.insights}
        nextMonthFocus={summary.nextMonthFocus}
      />
    </section>
  )
}

export default MonthlyNutritionDashboard
