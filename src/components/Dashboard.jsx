import { memo } from 'react'
import DashboardActivity from './dashboard/DashboardActivity.jsx'
import DashboardGoals from './dashboard/DashboardGoals.jsx'
import DashboardHealthScore from './dashboard/DashboardHealthScore.jsx'
import DashboardHero from './dashboard/DashboardHero.jsx'
import DashboardInsights from './dashboard/DashboardInsights.jsx'
import DashboardLayout from './dashboard/DashboardLayout.jsx'
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
    <DashboardLayout>
      <DashboardHero hero={dashboard.hero} />
      <DashboardHealthScore healthScore={dashboard.healthScore} />
      <DashboardToday today={dashboard.today} />
      <DashboardQuickActions actions={actions} />
      <DashboardInsights insights={dashboard.insights} />
      <DashboardProgress progress={dashboard.progress} />
      <DashboardActivity activity={dashboard.activity} />
      <DashboardGoals goals={dashboard.goals} />
    </DashboardLayout>
  )
}

export default memo(Dashboard)
