function Dashboard({
  checkIn,
  foods = [],
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
  const completedFoods = foods.filter((item) => item?.done).length
  const missingFood = foods.find((item) => !item?.done)
  const dailyFocus = getDailyFocus({
    checkIn,
    completedFoods,
    foodTotal: foods.length,
    missingFood,
  })

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
        {dailyFocus && (
          <article className="stat-card primary-stat">
            <span>Dagens fokus</span>
            <strong>{dailyFocus.title}</strong>
            <small>{dailyFocus.description}</small>
          </article>
        )}
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

function getDailyFocus({ checkIn, completedFoods, foodTotal, missingFood }) {
  const mood = String(checkIn?.mood || '').toLocaleLowerCase('sv-SE')
  const energy = Number(checkIn?.energy)
  const steps = Number(checkIn?.steps)
  const hasWorkout = Boolean(checkIn?.workout)
  const habitProgress = foodTotal > 0
    ? `Du har ${completedFoods}/${foodTotal} vanor klara`
    : 'Du har dagens vanor att bygga vidare på'

  if (energy <= 3 || mood === 'trött') {
    return {
      description: `Energin är ${Number.isFinite(energy) ? `${energy}/10` : 'låg'}, så återhämtning är smartast just nu.`,
      title: '😴 Prioritera återhämtning ikväll.',
    }
  }

  if (foodTotal > 0 && completedFoods < foodTotal) {
    const label = String(missingFood?.label || '').toLocaleLowerCase('sv-SE')

    if (label.includes('vatten')) {
      return {
        description: `${habitProgress}, så vatten är enklaste nästa steg.`,
        title: '💧 Drick mer vatten idag.',
      }
    }

    if (label.includes('grönsak') || label.includes('frukt')) {
      return {
        description: `${habitProgress}, så något grönt gör nästa måltid starkare.`,
        title: '🥗 Få in grönsaker till nästa måltid.',
      }
    }

    if (label.includes('protein')) {
      return {
        description: `${habitProgress}, så protein är bästa lilla justeringen.`,
        title: '💪 Protein till nästa måltid.',
      }
    }
  }

  if (Number.isFinite(steps) && steps < 7000 && !hasWorkout) {
    return {
      description: `Du har ${steps.toLocaleString('sv-SE')} steg och ingen träning markerad, så kort rörelse räcker.`,
      title: '🚶 En kort promenad räcker idag.',
    }
  }

  return {
    description: `${habitProgress}${hasWorkout ? ' och träningen är markerad' : ''}, så håll nivån stabil.`,
    title: '💪 Behåll dagens stabila rutin.',
  }
}

export default Dashboard
