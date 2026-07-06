import { memo } from 'react'

/**
 * Displays today's check-in and habit status.
 *
 * @param {{today: {energy: number, habitCount: number, habitTotal: number, mood: string, steps: number, workout: boolean}}} props
 * @returns {import('react').JSX.Element}
 */
function DashboardToday({ today }) {
  const stats = [
    ['Energi', `${today.energy}/10`],
    ['Humör', today.mood],
    ['Steg', today.steps.toLocaleString('sv-SE')],
    ['Matvanor', `${today.habitCount}/${today.habitTotal}`],
  ]

  return (
    <article className="dashboard-card">
      <div className="dashboard-card-heading">
        <div>
          <p className="eyebrow">I dag</p>
          <h3>Dagens läge</h3>
        </div>
        <span>{today.workout ? 'Träning' : 'Basdag'}</span>
      </div>
      <div className="dashboard-mini-grid">
        {stats.map(([label, value]) => (
          <div className="dashboard-mini-stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </article>
  )
}

export default memo(DashboardToday)
