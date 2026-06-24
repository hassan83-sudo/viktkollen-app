function CoachCard({ coachMessage, coachStatus }) {
  return (
    <article className="panel coach-panel" id="coach">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">AI-coach</p>
          <h2>Dagens återkoppling</h2>
        </div>
      </div>
      <p className="coach-copy">{coachMessage}</p>
      <div className="coach-note">
        {coachStatus || 'AI-coachen använder dagens profil, vanor och loggar.'}
      </div>
    </article>
  )
}

export default CoachCard
