function Progress({ badges, correctAnswers, level, xp }) {
  return (
    <section className="panel progress-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Progress</p>
          <h2>Din utveckling</h2>
        </div>
      </div>

      <div className="progress-grid">
        <article>
          <span>Total XP</span>
          <strong>{xp}</strong>
        </article>
        <article>
          <span>Rätt svar</span>
          <strong>{correctAnswers}</strong>
        </article>
        <article>
          <span>Nivå</span>
          <strong>{level}</strong>
        </article>
      </div>

      <div className="badge-list">
        {badges.map((badge) => (
          <span className={badge.unlocked ? 'badge unlocked' : 'badge'} key={badge.name}>
            {badge.name}
          </span>
        ))}
      </div>
    </section>
  )
}

export default Progress
