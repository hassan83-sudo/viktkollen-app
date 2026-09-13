import { useState } from 'react'
import { snoozeReminder } from '../services/reminders/reminderActions.js'

const snoozeOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20]

function ReminderSnoozeControls({ reminderId, reminderState, onSave, statusText = 'Påminnelsen snoozades.' }) {
  const [minutes, setMinutes] = useState(5)

  return (
    <span className="notice-actions">
      <label>
        Snooze
        <select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
          {snoozeOptions.map((value) => <option key={value} value={value}>{value} min</option>)}
        </select>
      </label>
      <button type="button" onClick={() => onSave?.(snoozeReminder(reminderState, reminderId, minutes), statusText)}>
        Snooza
      </button>
    </span>
  )
}

export default ReminderSnoozeControls
