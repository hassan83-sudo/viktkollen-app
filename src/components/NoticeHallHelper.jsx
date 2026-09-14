import { useState } from 'react'
import { normalizeReminder, normalizeReminderState } from '../services/reminders/reminderModel.js'
import { requestReminderNotificationPermission } from '../services/reminders/reminderNotifications.js'

const hallItems = [
  { title: 'Ta med nycklar', time: '08:00' },
  { title: 'Ta med plånbok', time: '08:00' },
  { title: 'Ta med mobilen', time: '08:00' },
  { title: 'Ta med väska', time: '08:00' },
  { title: 'Ta på jacka', time: '08:00' },
  { title: 'Dags att gå', time: '08:10' },
  { title: 'Lås dörren', time: '08:12' },
]

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function NoticeHallHelper({ reminderState, onRemindersChange, onClose, onMessage }) {
  const [selected, setSelected] = useState(hallItems[0])
  const [time, setTime] = useState(hallItems[0].time)

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
      id: `hall-${selected.title.toLowerCase().replace(/[^a-z0-9åäö]+/gi, '-')}-${Date.now()}`,
      scheduleType: 'once',
      source: 'hall_quick',
      startDate: localDate(),
      time,
      title: selected.title,
      updatedAt: now,
    }, { now })

    onRemindersChange?.(normalizeReminderState({ ...state, reminders: [...state.reminders, reminder], updatedAt: now }))
    if (push.ok) onMessage?.(`${selected.title} är satt till kl. ${time}.`)
    else onMessage?.(`${selected.title} är sparad kl. ${time}. Kontrollera systemnotiser om du vill ha push.`)
  }

  return (
    <div className="notice-room-panel" aria-labelledby="hall-heading">
      <div className="notice-actions"><h3 id="hall-heading">Hall / Entré – ta med</h3><button type="button" onClick={onClose}>Stäng</button></div>
      <p>Snabbknappar för sådant du vill komma ihåg innan du går hemifrån.</p>
      <div className="notice-suggestions" aria-label="Hallpåminnelser">
        {hallItems.map((item) => <button key={item.title} type="button" aria-pressed={selected.title === item.title} onClick={() => choose(item)}>{item.title}</button>)}
      </div>
      <div className="notice-form-grid"><label>Tid<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label></div>
      <div className="notice-actions"><button className="primary-button" type="button" onClick={activate}>Aktivera {selected.title}</button></div>
      <p className="estimate-note">Påminnelsen sparas i Notis och använder samma push- och Snooze/Klar-system som övriga larm.</p>
    </div>
  )
}

export default NoticeHallHelper
