function WeeklyGoalsCard({ weeklyGoals }) {
  return (
    <article className="stat-card">
      <span>Veckans mål</span>
      {weeklyGoals.map((goal) => (
        <small key={goal.text}>
          {goal.done ? '✓' : '☐'} {goal.text}
        </small>
      ))}
    </article>
  )
}

export default WeeklyGoalsCard
