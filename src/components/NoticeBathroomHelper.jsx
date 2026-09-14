import { useState } from 'react'
import { normalizeReminder, normalizeReminderState } from '../services/reminders/reminderModel.js'
import { requestReminderNotificationPermission } from '../services/reminders/reminderNotifications.js'

const bathroomItems = [
  { title: 'Tandborstning', time: '07:30', repeat: 'daily', intervalMinutes: 0 },
  { title: 'Dusch', time: '19:00', repeat: 'interval', intervalMinutes: 2880 },
  { title: 'Schampo', time: '18:00', repeat: 'interval', intervalMinutes: 4320 },
  { title: 'Hudkräm', time: '20:00', repeat: 'daily', intervalMinutes: 0 },
  { title: 'Ansiktstvätt', time: '20:30', repeat: 'daily', intervalMinutes: 0 },
  { title: 'Rakning', time: '18:30', repeat: 'interval', intervalMinutes: 4320 },
  { title: 'Deo', time: '08:00', repeat: 'daily', intervalMinutes: 0 },
  { title: 'Naglar', time: '18:00', repeat: 'weekly', intervalMinutes: 0 },
]

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function repeatText(item) {
  if (item.repeat === 'daily') return 'Varje dag'
  if (item.repeat === 'weekly') return 'Varje vecka'
  if (item.intervalMinutes === 2880) return 'Varannan dag'
  if (item.intervalMinutes === 4320) return 'Var tredje dag'
  return 'Återkommande'
}

function NoticeBathroomHelper({ reminderState, onRemindersChange, onClose, onMessage }) {
  const [selected, setSelected] = useState(bathroomItems[0])
  const [time, setTime] = useState(bathroomItems[0].time)

  function selectItem(item) {
    setSelected(item)
    setTime(item.time)
  }

  async function activate() {
    const push = await requestReminderNotificationPermission()
    const state = normalizeReminderState(reminderState)
    const now = new Date().toISOString()
    const reminder = normalizeReminder({
      createdAt: now,
      description: `Dags för ${selected.title}.`,
      id: `bathroom-${selected.title.toLowerCase().replace(/[^a-z0-9åäö]+/gi, '-')}-${Date.now()}`,
      intervalMinutes: selected.intervalMinutes,
      scheduleType: selected.repeat,
      source: 'bathroom_quick',
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

    if (push.ok) onMessage?.(`${selected.title} är aktiverad kl. ${time}.`)
    else onMessage?.(`${selected.title} är sparad kl. ${time}. Kontrollera systemnotiser om du vill ha push.`)
  }

  return (
    <div className="notice-room-panel" aria-labelledby="bathroom-heading">
      <div className="notice-actions">
        <h3 id="bathroom-heading">Badrum – snabbpåminnelser</h3>
        <button type="button" onClick={onClose}>Stäng</button>
      </div>
      <p>Välj vad du vill bli påmind om. Tiden kan ändras innan du aktiverar.</p>

      <div className="notice-suggestions" aria-label="Badrumspåminnelser">
        {bathroomItems.map((item) => (
          <button key={item.title} type="button" aria-pressed={selected.title === item.title} onClick={() => selectItem(item)}>
            {item.title}
          </button>
        ))}
      </div>

      <div className="notice-form-grid">
        <label>Tid<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
        <label>Upprepning<input type="text" readOnly value={repeatText(selected)} /></label>
      </div>

      <div className="notice-actions">
        <button className="primary-button" type="button" onClick={activate}>Aktivera {selected.title}</button>
      </div>
      <p className="estimate-note">Påminnelsen hamnar i samma system som övriga Notis-larm och får Snooze/Klar där.</p>
    </div>
  )
}

export default NoticeBathroomHelper
