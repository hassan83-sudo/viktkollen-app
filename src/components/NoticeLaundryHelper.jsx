import { useState } from 'react'
import { normalizeReminder, normalizeReminderState } from '../services/reminders/reminderModel.js'
import { requestReminderNotificationPermission } from '../services/reminders/reminderNotifications.js'

const laundryItems = [
  { title: 'Starta tvätt', time: '18:00' },
  { title: 'Tvätten är klar', time: '19:00' },
  { title: 'Häng tvätten', time: '19:05' },
  { title: 'Starta torktumlare', time: '19:10' },
  { title: 'Ta ut tvätten', time: '20:00' },
  { title: 'Vik tvätten', time: '20:15' },
  { title: 'Boka tvättid', time: '17:00' },
]

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function NoticeLaundryHelper({ reminderState, onRemindersChange, onClose, onMessage }) {
  const [selected, setSelected] = useState(laundryItems[0])
  const [time, setTime] = useState(laundryItems[0].time)

  function choose(item) { setSelected(item); setTime(item.time) }

  async function activate() {
    const push = await requestReminderNotificationPermission()
    const state = normalizeReminderState(reminderState)
    const now = new Date().toISOString()
    const reminder = normalizeReminder({
      createdAt: now,
      description: `${selected.title}.`,
      id: `laundry-${selected.title.toLowerCase().replace(/[^a-z0-9åäö]+/gi, '-')}-${Date.now()}`,
      scheduleType: 'once',
      source: 'laundry_quick',
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
    <div className="notice-room-panel" aria-labelledby="laundry-heading">
      <div className="notice-actions"><h3 id="laundry-heading">Tvätt – snabbpåminnelser</h3><button type="button" onClick={onClose}>Stäng</button></div>
      <p>Snabbknappar för tvätt, torkning och att komma ihåg tvätten.</p>
      <div className="notice-suggestions" aria-label="Tvätt-påminnelser">
        {laundryItems.map((item) => <button key={item.title} type="button" aria-pressed={selected.title === item.title} onClick={() => choose(item)}>{item.title}</button>)}
      </div>
      <div className="notice-form-grid"><label>Tid<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label></div>
      <div className="notice-actions"><button className="primary-button" type="button" onClick={activate}>Aktivera {selected.title}</button></div>
      <p className="estimate-note">Påminnelsen sparas i Notis och använder samma push- och Snooze/Klar-system som övriga larm.</p>
    </div>
  )
}

export default NoticeLaundryHelper
