function HabitProgressCard({ habits }) {
  return (
    <section className="nutrition-card progress-card" aria-labelledby="progress-habits-title">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Vanor och check-ins</p>
          <h3 id="progress-habits-title">Rutiner</h3>
        </div>
      </div>
      <dl className="progress-detail-grid">
        <div><dt>Check-ins</dt><dd>{habits.checkInCount}</dd></div>
        <div><dt>Energi</dt><dd>{habits.averageEnergy === null ? 'Saknas' : `${habits.averageEnergy}/10`}</dd></div>
        <div><dt>Humör</dt><dd>{habits.averageMood || 'Saknas'}</dd></div>
        <div><dt>Steg</dt><dd>{habits.averageSteps ? `${habits.averageSteps.toLocaleString('sv-SE')} steg/dag` : 'Saknas'}</dd></div>
        <div><dt>Träningsdagar</dt><dd>{habits.trainingDays}</dd></div>
        <div><dt>Vanligaste träning</dt><dd>{habits.trainingForm || 'Saknas'}</dd></div>
        <div><dt>Slutförda vanor</dt><dd>{habits.completedHabits}/{habits.activeHabits}</dd></div>
        <div><dt>Bästa streak</dt><dd>{habits.bestStreak} dagar</dd></div>
      </dl>
    </section>
  )
}

export default HabitProgressCard
