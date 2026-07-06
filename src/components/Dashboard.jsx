import { memo } from 'react'
import DashboardActivity from './dashboard/DashboardActivity.jsx'
import DashboardGoals from './dashboard/DashboardGoals.jsx'
import DashboardHealthScore from './dashboard/DashboardHealthScore.jsx'
import DashboardHero from './dashboard/DashboardHero.jsx'
import DashboardInsights from './dashboard/DashboardInsights.jsx'
import DashboardProgress from './dashboard/DashboardProgress.jsx'
import DashboardQuickActions from './dashboard/DashboardQuickActions.jsx'
import DashboardToday from './dashboard/DashboardToday.jsx'

/**
 * Composes the Smart AI Dashboard from calculated dashboard data.
 *
 * @param {{actions: object, dashboard: object}} props
 * @returns {import('react').JSX.Element}
 */
function Dashboard({ actions, dashboard }) {
  return (
    <section className="dashboard-v3" aria-label="Smart AI Dashboard">
      <DashboardHero hero={dashboard.hero} />
      <DashboardHealthScore healthScore={dashboard.healthScore} />
      <DashboardToday today={dashboard.today} />
      <DashboardQuickActions actions={actions} />
      <DashboardInsights insights={dashboard.insights} />
      <DashboardProgress progress={dashboard.progress} />
      <DashboardActivity activity={dashboard.activity} />
      <DashboardGoals goals={dashboard.goals} />
    </section>
  )
}

export default memo(Dashboard)
