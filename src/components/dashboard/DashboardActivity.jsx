import { memo } from 'react'

/**
 * Lists recent app activity in descending time order.
 *
 * @param {{activity: Array<{description: string, icon: string, timeLabel: string, title: string, type: string}>}} props
 * @returns {import('react').JSX.Element}
 */
function DashboardActivity({ activity }) {
  return (
    <article className="dashboard-card dashboard-wide-card">
      <div className="dashboard-card-heading">
        <div>
          <p className="eyebrow">Tidslinje</p>
          <h3>Aktivitet</h3>
        </div>
      </div>
      {activity.length > 0 ? (
        <ol className="dashboard-activity-list">
          {activity.map((item) => (
            <li key={`${item.type}-${item.timeLabel}-${item.title}`}>
              <span className="dashboard-activity-icon" aria-hidden="true">
                {item.icon}
              </span>
              <div>
                <div className="dashboard-activity-meta">
                  <strong>{item.title}</strong>
                  <time>{item.timeLabel}</time>
                </div>
                <p>{item.description}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="dashboard-empty">
          Logga vikt, analysera en måltid eller gör en check-in så byggs
          tidslinjen automatiskt.
        </p>
      )}
    </article>
  )
}

export default memo(DashboardActivity)
