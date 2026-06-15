function Squad({ members, squad, onCreateSquad, onJoinSquad, userXp }) {
  const squadScore = userXp + 1480

  return (
    <section className="panel squad-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Squad</p>
          <h2>Plugga tillsammans</h2>
        </div>
      </div>

      {squad ? (
        <div className="squad-card">
          <strong>{squad}</strong>
          <p>Lagpoäng: {squadScore} XP</p>
          <div className="squad-members">
            <span>Du</span>
            {members.map((member) => (
              <span key={member}>{member}</span>
            ))}
          </div>
        </div>
      ) : (
        <div className="squad-actions">
          <button type="button" onClick={() => onCreateSquad('Team Genius')}>
            Skapa lag
          </button>
          <button type="button" onClick={() => onJoinSquad('PluggSquad')}>
            Gå med i lag
          </button>
        </div>
      )}
    </section>
  )
}

export default Squad
