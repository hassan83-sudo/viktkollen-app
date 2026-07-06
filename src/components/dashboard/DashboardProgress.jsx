import { memo } from 'react'

function formatCount(value) {
  return Number(value) > 0 ? value : 'Inte än'
}

/**
 * Summarizes weight and AI analysis progress.
 *
 * @param {{progress: {bodyAnalysisCount: number, latestActivity: string, mealAnalysisCount: number, weeklyReportCount: number, weightTrend: string}}} props
 * @returns {import('react').JSX.Element}
 */
function DashboardProgress({ progress }) {
  const stats = [
    ['Vikttrend', progress.weightTrend || 'Logga minst två vikter'],
    ['AI-analyser', formatCount(progress.bodyAnalysisCount)],
    ['Måltidsanalyser', formatCount(progress.mealAnalysisCount)],
    ['Veckorapporter', formatCount(progress.weeklyReportCount)],
    ['Senaste aktivitet', progress.latestActivity || 'Ingen aktivitet ännu'],
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
