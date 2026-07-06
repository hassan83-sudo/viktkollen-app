import { memo } from 'react'

/**
 * Shows the latest AI dashboard insights with empty states.
 *
 * @param {{insights: Array<{empty: string, meta: string, title: string, value: string}>}} props
 * @returns {import('react').JSX.Element}
 */
function DashboardInsights({ insights }) {
  return (
    <article className="dashboard-card dashboard-wide-card">
      <div className="dashboard-card-heading">
        <div>
          <p className="eyebrow">Senaste AI-insikter</p>
          <h3>Insights</h3>
        </div>
      </div>
      <div className="dashboard-insight-grid">
        {insights.map((insight) => {
          const hasValue = Boolean(insight.value)

          return (
            <section
              className={`dashboard-insight${hasValue ? '' : ' is-empty'}`}
              key={insight.title}
            >
              <span>{insight.title}</span>
              <p>{hasValue ? insight.value : insight.empty}</p>
              {insight.meta && <small>{insight.meta}</small>}
            </section>
          )
        })}
      </div>
    </article>
  )
}

export default memo(DashboardInsights)
