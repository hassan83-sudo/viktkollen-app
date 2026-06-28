function CoachSuggestions({ coachMessage, coachStatus }) {
  return (
    <>
      <p className="coach-copy">{coachMessage}</p>
      <div className="coach-note">{coachStatus}</div>
    </>
  )
}

export default CoachSuggestions
