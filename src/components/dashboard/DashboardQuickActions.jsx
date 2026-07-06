import { memo } from 'react'

const quickActions = [
  ['Registrera vikt', '#vikt'],
  ['Lägg till måltid', '#mat'],
  ['AI Coach', '#coach'],
  ['AI Kroppsanalys', '#framstegsbilder'],
  ['Matfotoanalys', '#mat'],
]

/**
 * Renders dashboard shortcuts to core workflows.
 *
 * @param {{actions: {onCreateWeeklyReport?: () => void}}} props
 * @returns {import('react').JSX.Element}
 */
function DashboardQuickActions({ actions }) {
  return (
    <article className="dashboard-card">
      <div className="dashboard-card-heading">
        <div>
          <p className="eyebrow">Snabbval</p>
          <h3>Quick Actions</h3>
        </div>
      </div>
      <div className="dashboard-actions">
        {quickActions.map(([label, href]) => (
          <a href={href} key={label}>
            {label}
          </a>
        ))}
        <button type="button" onClick={actions.onCreateWeeklyReport}>
          Veckorapport
        </button>
      </div>
    </article>
  )
}

export default memo(DashboardQuickActions)
