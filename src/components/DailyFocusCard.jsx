function DailyFocusCard({ dailyFocus, quickStatus }) {
  return (
    <article className="stat-card primary-stat">
      <span>Dagens fokus</span>
      <strong>{dailyFocus.title}</strong>
      <small>{dailyFocus.description}</small>
      <small>{quickStatus}</small>
    </article>
  )
}

export default DailyFocusCard
