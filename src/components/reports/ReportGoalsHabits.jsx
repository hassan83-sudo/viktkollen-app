function ReportGoalsHabits({ goalsHabits }) {
  return (
    <section className="report-v3-card">
      <h3>Mål & vanor</h3>
      {goalsHabits ? (
        <>
          <p>{goalsHabits.summary}</p>
          <p>{goalsHabits.positiveProgress}</p>
          {goalsHabits.nextStep && <p>{goalsHabits.nextStep}</p>}
          <a className="secondary-button" href="#mal-vanor">Öppna mål & vanor</a>
        </>
      ) : (
        <p>Inga aktiva mål eller vanor finns i rapportunderlaget ännu.</p>
      )}
    </section>
  )
}

export default ReportGoalsHabits
