function CoachSuggestions({ coachMessage, coachStatus, isLoading = false }) {
  const message = coachMessage || 'Coachen saknar tillräckligt med data just nu. Logga en måltid, vikt eller check-in så kan den ge ett tydligare nästa steg.'
  const status = isLoading
    ? 'Analyserar senaste vikt, måltider och check-in...'
    : coachStatus

  return (
    <section className={`coach-suggestions${isLoading ? ' is-loading' : ''}`} aria-live="polite">
      <p className="coach-copy">{message}</p>
      {status && <div className="coach-note" role={isLoading ? 'status' : undefined}>{status}</div>}
    </section>
  )
}

export default CoachSuggestions
