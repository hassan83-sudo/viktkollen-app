function countActive(items = []) {
  return items.filter((item) => item && item.status !== 'archived' && item.status !== 'completed').length
}

function MoreGoalsFolder({ goalsHabits = {}, profileCompleteness }) {
  const goals = Array.isArray(goalsHabits.goals) ? goalsHabits.goals : []
  const habits = Array.isArray(goalsHabits.habits) ? goalsHabits.habits : []
  const weeklyFocus = Array.isArray(goalsHabits.weeklyFocus) ? goalsHabits.weeklyFocus : []
  const unlocked = goalsHabits.achievements?.unlocked || []
  const activeGoals = countActive(goals)
  const activeHabits = countActive(habits)

  return (
    <article className="panel more-goals-folder" id="mal-framsteg-oversikt">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Sekundära målinställningar</p>
          <h2>Målöversikt</h2>
        </div>
      </div>
      <p className="panel-copy">
        Här ligger mål-, vana- och achievement-metadata från Mer. Viktgraf, kroppsscanning och framstegsbilder finns under Framsteg.
      </p>
      <div className="more-goals-cards">
        <div className="more-goals-card">
          <span>Aktiva mål</span>
          <strong>{activeGoals}</strong>
        </div>
        <div className="more-goals-card">
          <span>Aktiva vanor</span>
          <strong>{activeHabits}</strong>
        </div>
        <div className="more-goals-card">
          <span>Achievements</span>
          <strong>{unlocked.length}</strong>
        </div>
        <div className="more-goals-card">
          <span>Veckofokus</span>
          <strong>{weeklyFocus.filter((item) => !item.archivedAt && !item.completedAt).length}</strong>
        </div>
      </div>
      {goals.slice(0, 4).map((goal) => (
        <div className="more-goals-row" key={goal.id}>
          <strong>{goal.title || 'Mål'}</strong>
          <span>{goal.statusLabel || goal.status || 'Aktiv'}</span>
        </div>
      ))}
      {habits.slice(0, 4).map((habit) => (
        <div className="more-goals-row" key={habit.id}>
          <strong>{habit.title || 'Vana'}</strong>
          <span>{habit.statusLabel || habit.status || 'Aktiv'}</span>
        </div>
      ))}
      <p className="settings-note">
        {profileCompleteness?.nextBestAction || 'Komplettera mål och vanor i Coach när du vill ändra dem.'}
      </p>
    </article>
  )
}

export default MoreGoalsFolder
