import { useState } from 'react'
import { normalizeReminder, normalizeReminderState } from '../services/reminders/reminderModel.js'
import { requestReminderNotificationPermission } from '../services/reminders/reminderNotifications.js'

const livingRoomItems = [
  { title: 'Ta en paus', time: '19:00' },
  { title: 'Res dig upp', time: '19:30' },
  { title: 'Drick vatten', time: '20:00' },
  { title: 'Ladda mobilen', time: '21:00' },
  { title: 'Stäng av TV', time: '22:00' },
  { title: 'Dags för sängen', time: '22:30' },
]

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function NoticeLivingRoomHelper({ reminderState, onRemindersChange, onClose, onMessage }) {
  const [selected, setSelected] = useState(livingRoomItems[0])
  const [time, setTime] = useState(livingRoomItems[0].time)

  function choose(item) {
    setSelected(item)
    setTime(item.time)
  }

  async function activate() {
    const push = await requestReminderNotificationPermission()
    const state = normalizeReminderState(reminderState)
    const now = new Date().toISOString()
    const reminder = normalizeReminder({
      createdAt: now,
      description: `${selected.title}.`,
      id: `living-room-${selected.title.toLowerCase().replace(/[^a-z0-9åäö]+/gi, '-')}-${Date.now()}`,
      scheduleType: 'once',
      source: 'living_room_quick',
      startDate: localDate(),
      time,
      title: selected.title,
      updatedAt: now,
    }, { now })

    onRemindersChange?.(normalizeReminderState({
      ...state,
      reminders: [...state.reminders, reminder],
      updatedAt: now,
    }))

    if (push.ok) onMessage?.(`${selected.title} är satt till kl. ${time}.`)
    else onMessage?.(`${selected.title} är sparad kl. ${time}. Kontrollera systemnotiser om du vill ha push.`)
  }

  return (
    <div className="notice-room-panel" aria-labelledby="living-room-heading">
      <div className="notice-actions">
        <h3 id="living-room-heading">Vardagsrum – snabbpåminnelser</h3>
        <button type="button" onClick={onClose}>Stäng</button>
      </div>
      <p>Snabbknappar för vanliga saker i vardagsrummet. Ändra tiden innan du aktiverar.</p>

      <div className="notice-suggestions" aria-label="Vardagsrumspåminnelser">
        {livingRoomItems.map((item) => (
          <button key={item.title} type="button" aria-pressed={selected.title === item.title} onClick={() => choose(item)}>{item.title}</button>
        ))}
      </div>

      <div className="notice-form-grid">
        <label>Tid<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
      </div>
      <div className="notice-actions">
        <button className="primary-button" type="button" onClick={activate}>Aktivera {selected.title}</button>
      </div>
      <p className="estimate-note">Påminnelsen sparas i Notis och använder samma push- och Snooze/Klar-system som övriga larm.</p>
    </div>
  )
}

export default NoticeLivingRoomHelper
