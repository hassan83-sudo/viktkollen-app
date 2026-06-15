function Dashboard({
  hasClaimedToday,
  level,
  onClaimDailyReward,
  onLogout,
  streak,
  username,
  xp,
}) {
  const nextLevelXp = level === 'Rookie' ? 500 : level === 'Smart' ? 1000 : xp
  const progress = level === 'Genius'
    ? 100
    : Math.min(Math.round((xp / nextLevelXp) * 100), 100)

  return (
    <header className="dashboard">
      <div className="hero-copy">
        <div className="hero-topline">
          <p className="eyebrow">PluggArena v2</p>
          <button className="ghost-button" type="button" onClick={onLogout}>
            Logga ut
          </button>
        </div>
        <h1>PluggArena</h1>
        <p className="subtitle">
          Hej {username}, välj ämne, samla XP och bygg streak med ditt squad.
        </p>
      </div>

      <div className="stats-grid" aria-label="Din progression">
        <article className="stat-card primary-stat">
          <span>XP</span>
          <strong>{xp}</strong>
          <small>{level === 'Genius' ? 'Maxnivå just nu' : `${progress}% till nästa nivå`}</small>
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
        </article>
        <article className="stat-card">
          <span>Level</span>
          <strong>{level}</strong>
          <small>Rookie 0-499 · Smart 500-999 · Genius 1000+</small>
        </article>
        <article className="stat-card streak-card">
          <span>Daily Streak</span>
          <strong>{streak} dagar</strong>
          <small>i rad</small>
          <button type="button" onClick={onClaimDailyReward} disabled={hasClaimedToday}>
            {hasClaimedToday ? 'Bonus hämtad' : 'Hämta +50 XP'}
          </button>
        </article>
      </div>
    </header>
  )
}

export default Dashboard
