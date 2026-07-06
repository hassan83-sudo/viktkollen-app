import { memo } from 'react'

const quickActions = [
  {
    label: 'Registrera vikt',
    targets: ['vikt'],
  },
  {
    label: 'Lägg till måltid',
    targets: ['maltider', 'mat'],
  },
  {
    label: 'AI Coach',
    targets: ['coach', 'chat'],
  },
  {
    label: 'AI Kroppsanalys',
    targets: ['framstegsbilder'],
  },
  {
    label: 'Matfotoanalys',
    targets: ['maltider', 'mat'],
  },
]

function scrollToDashboardTarget(targets) {
  const target = targets
    .map((targetId) => document.getElementById(targetId))
    .find(Boolean)

  if (!target) {
    window.location.hash = targets[0] || ''
    return
  }

  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  window.history.replaceState(null, '', `#${target.id}`)
}

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
        {quickActions.map((action) => (
          <button
            className="dashboard-action-button"
            key={action.label}
            type="button"
            onClick={() => scrollToDashboardTarget(action.targets)}
          >
            {action.label}
          </button>
        ))}
        <button
          className="dashboard-action-button primary"
          type="button"
          onClick={() => {
            actions.onCreateWeeklyReport?.()
            scrollToDashboardTarget(['framsteg'])
          }}
        >
          Veckorapport
        </button>
      </div>
    </article>
  )
}

export default memo(DashboardQuickActions)
