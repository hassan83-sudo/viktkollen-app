const rewards = [
  { xp: 1000, title: 'AirPods-lott', description: 'Lås upp när du når 1000 XP.' },
  { xp: 500, title: 'Badge', description: 'Visa att du är på Smart-nivå.' },
  { xp: 200, title: 'Avatar', description: 'Ge profilen en ny stil.' },
]

function Rewards({ xp }) {
  return (
    <section className="panel rewards-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Rewards</p>
          <h2>Belöningar</h2>
        </div>
      </div>

      <div className="reward-list">
        {rewards.map((reward) => {
          const unlocked = xp >= reward.xp

          return (
            <article className={unlocked ? 'reward unlocked' : 'reward'} key={reward.title}>
              <span>{reward.xp} XP</span>
              <strong>{reward.title}</strong>
              <p>{reward.description}</p>
              <em>{unlocked ? 'Upplåst' : `${reward.xp - xp} XP kvar`}</em>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default Rewards
