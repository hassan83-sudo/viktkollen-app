import { memo } from 'react'

/**
 * Provides the responsive dashboard grid shell.
 *
 * @param {{children: import('react').ReactNode}} props
 * @returns {import('react').JSX.Element}
 */
function DashboardLayout({ children }) {
  return (
    <section className="dashboard-v3" aria-label="Smart AI Dashboard">
      {children}
    </section>
  )
}

export default memo(DashboardLayout)
