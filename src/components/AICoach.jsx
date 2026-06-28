import CoachSuggestions from './CoachSuggestions.jsx'

function AICoach({ coachMessage, coachStatus }) {
  const resolvedCoachStatus =
    coachStatus || 'AI-coachen använder dagens profil, vanor och loggar.'

  return (
    <article className="panel coach-panel" id="coach">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">AI-coach</p>
          <h2>Dagens återkoppling</h2>
        </div>
      </div>
      <CoachSuggestions
        coachMessage={coachMessage}
        coachStatus={resolvedCoachStatus}
      />
    </article>
  )
}

export default AICoach
