function ReminderBanner({ dueReminders = [], onComplete, onOpenCenter, onSkip, onSnooze }) {
  if (!dueReminders.length) return null
  const visible = dueReminders.slice(0, 2)
  const extraCount = dueReminders.length - visible.length

  return (
    <section className="reminder-banner" aria-live="polite" aria-label="Aktuella påminnelser">
      <div>
        <p className="eyebrow">Påminnelse</p>
        <h2>{dueReminders.length === 1 ? visible[0].title : `${dueReminders.length} påminnelser väntar`}</h2>
      </div>
      <div className="reminder-banner-list">
        {visible.map((reminder) => (
          <article key={reminder.id}>
            <strong>{reminder.title}</strong>
            <span>{reminder.description}</span>
            <div className="habit-actions">
              <button type="button" onClick={() => onComplete(reminder.id)}>Klar</button>
              <button type="button" onClick={() => onSnooze(reminder.id, 30)}>Snooza 30 min</button>
              <button type="button" onClick={() => onSkip(reminder.id)}>Hoppa över</button>
            </div>
          </article>
        ))}
        {extraCount > 0 && <p className="estimate-note">+{extraCount} fler i Reminder Center.</p>}
      </div>
      <button type="button" className="secondary-button" onClick={onOpenCenter}>Öppna Reminder Center</button>
    </section>
  )
}

export default ReminderBanner
