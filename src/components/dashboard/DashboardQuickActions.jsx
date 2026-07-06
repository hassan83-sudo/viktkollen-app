import { memo } from 'react'

const quickActions = [
  {
    fallbackHash: 'vikt',
    label: 'Registrera vikt',
    targets: ['vikt'],
  },
  {
    fallbackHash: 'maltider',
    label: 'Lägg till måltid',
    targets: ['maltider', 'mat'],
  },
  {
    fallbackHash: 'coach',
    label: 'AI Coach',
    targets: ['coach', 'chat'],
  },
  {
    fallbackHash: 'framstegsbilder',
    label: 'AI Kroppsanalys',
    targets: ['framstegsbilder'],
  },
  {
    fallbackHash: 'maltider',
    label: 'Matfotoanalys',
    targets: ['maltider', 'mat'],
  },
]

function findTarget(targets) {
  return targets
    .map((targetId) => document.getElementById(targetId))
    .find(Boolean)
}

function updateAppHash(targetId) {
  window.history.replaceState(null, '', `#${targetId}`)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

function navigateToDashboardTarget({ fallbackHash, targets }) {
  const target = findTarget(targets)

  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    updateAppHash(target.id)
    return
  }

  updateAppHash(fallbackHash)

  window.requestAnimationFrame(() => {
    const delayedTarget = findTarget([fallbackHash, ...targets])

    if (delayedTarget) {
      delayedTarget.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  })
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
            onClick={() => navigateToDashboardTarget(action)}
          >
            {action.label}
          </button>
        ))}
        <button
          className="dashboard-action-button primary"
          type="button"
          onClick={() => {
            actions.onCreateWeeklyReport?.()
            navigateToDashboardTarget({
              fallbackHash: 'framsteg',
              targets: ['framsteg'],
            })
          }}
        >
          Veckorapport
        </button>
      </div>
    </article>
  )
}

export default memo(DashboardQuickActions)
