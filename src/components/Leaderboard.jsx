function Leaderboard({ currentUser, entries }) {
  return (
    <section className="panel leaderboard-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Topplista</p>
          <h2>Veckans arena</h2>
        </div>
      </div>

      <ol className="leaderboard-list">
        {entries.map((entry, index) => (
          <li className={entry.name === currentUser ? 'current-user' : ''} key={entry.name}>
            <span>{index + 1}</span>
            <strong>{entry.name}</strong>
            <em>{entry.xp} XP</em>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default Leaderboard
