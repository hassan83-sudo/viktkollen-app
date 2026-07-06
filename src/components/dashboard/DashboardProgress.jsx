import { memo } from 'react'

/**
 * Summarizes weight and AI analysis progress.
 *
 * @param {{progress: {bodyAnalysisCount: number, latestActivity: string, mealAnalysisCount: number, weeklyReportCount: number, weightTrend: string}}} props
 * @returns {import('react').JSX.Element}
 */
function DashboardProgress({ progress }) {
  const stats = [
    ['Vikttrend', progress.weightTrend],
    ['AI-analyser', progress.bodyAnalysisCount],
    ['Måltidsanalyser', progress.mealAnalysisCount],
    ['Veckorapporter', progress.weeklyReportCount],
    ['Senaste aktivitet', progress.latestActivity],
  ]

  return (
    <article className="dashboard-card">
      <div className="dashboard-card-heading">
        <div>
          <p className="eyebrow">Framsteg</p>
          <h3>Progress</h3>
        </div>
      </div>
      <div className="dashboard-progress-list">
        {stats.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </article>
  )
}

export default memo(DashboardProgress)
