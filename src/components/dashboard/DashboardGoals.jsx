import { memo } from 'react'

/**
 * Shows goal-weight direction and next recommended step.
 *
 * @param {{goals: {currentWeight: number | null, nextStep: string, remainingLabel: string, targetLabel: string, trendDirection: string}}} props
 * @returns {import('react').JSX.Element}
 */
function DashboardGoals({ goals }) {
  return (
    <article className="dashboard-card">
      <div className="dashboard-card-heading">
        <div>
          <p className="eyebrow">Mål</p>
          <h3>Målriktning</h3>
        </div>
        <span>{goals.trendDirection}</span>
      </div>
      <div className="dashboard-goal-stack">
        <div>
          <span>Målvikt</span>
          <strong>{goals.targetLabel}</strong>
        </div>
        <div>
          <span>Kvar till mål</span>
          <strong>{goals.remainingLabel}</strong>
        </div>
        <div>
          <span>Uppskattad riktning</span>
          <strong>{goals.trendDirection}</strong>
        </div>
      </div>
      <p className="dashboard-note">{goals.nextStep}</p>
    </article>
  )
}

export default memo(DashboardGoals)
