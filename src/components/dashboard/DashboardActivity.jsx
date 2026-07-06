import { memo } from 'react'

/**
 * Lists recent app activity in descending time order.
 *
 * @param {{activity: Array<{detail: string, timeLabel: string, title: string, type: string}>}} props
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
              <span>{item.timeLabel}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="dashboard-empty">Aktivitet visas här när du börjar logga.</p>
      )}
    </article>
  )
}

export default memo(DashboardActivity)
