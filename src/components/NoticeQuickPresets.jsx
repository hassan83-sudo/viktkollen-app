import { normalizeReminder, normalizeReminderState, weekDays } from '../services/reminders/reminderModel.js'
import { requestReminderNotificationPermission } from '../services/reminders/reminderNotifications.js'

const quickPresets = [
  { title: 'Deo', time: '08:00', scheduleType: 'daily' },
  { title: 'Tandborstning morgon', time: '07:30', scheduleType: 'daily' },
  { title: 'Tandborstning kväll', time: '21:30', scheduleType: 'daily' },
  { title: 'Dusch', time: '19:00', scheduleType: 'interval', intervalMinutes: 2880 },
  { title: 'Schampo', time: '18:00', scheduleType: 'interval', intervalMinutes: 4320 },
  { title: 'Hudkräm', time: '20:00', scheduleType: 'daily' },
  { title: 'Ansiktstvätt', time: '20:30', scheduleType: 'daily' },
  { title: 'Rakning', time: '18:30', scheduleType: 'interval', intervalMinutes: 4320 },
  { title: 'Naglar', time: '18:00', scheduleType: 'weekly' },
  { title: 'Tvätta händerna', time: '12:00', scheduleType: 'daily' },
  { title: 'Ridning', time: '13:45', scheduleType: 'weekly' },
  { title: 'Drick vatten', time: '10:00', scheduleType: 'interval', intervalMinutes: 120 },
]

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function currentWeekday() {
  return weekDays[(new Date().getDay() + 6) % 7]
}

function repeatLabel(preset) {
  if (preset.scheduleType === 'daily') return 'Varje dag'
  if (preset.scheduleType === 'weekly') return 'Varje vecka'
  if (preset.intervalMinutes === 120) return 'Varannan timme'
  if (preset.intervalMinutes === 180) return 'Var tredje timme'
  if (preset.intervalMinutes === 2880) return 'Varannan dag'
  if (preset.intervalMinutes === 4320) return 'Var tredje dag'
  return 'Återkommande'
}

function NoticeQuickPresets({ reminderState, onRemindersChange, onMessage }) {
  async function activatePreset(preset) {
    // This call is deliberately the first async operation after the tap so
    // iPhone can show its native notification permission prompt.
    const push = await requestReminderNotificationPermission()

    const state = normalizeReminderState(reminderState)
    const now = new Date().toISOString()
    const reminder = normalizeReminder({
      createdAt: now,
      daysOfWeek: preset.scheduleType === 'weekly' ? [currentWeekday()] : undefined,
      description: `Dags för ${preset.title}.`,
      id: `quick-${preset.title.toLowerCase().replace(/[^a-z0-9åäö]+/gi, '-')}-${Date.now()}`,
      intervalMinutes: preset.intervalMinutes || 0,
      scheduleType: preset.scheduleType,
      source: 'quick_preset',
      startDate: localDate(),
      time: preset.time,
      title: preset.title,
      updatedAt: now,
    }, { now })

    onRemindersChange?.(normalizeReminderState({
      ...state,
      reminders: [...state.reminders, reminder],
      updatedAt: now,
    }))

    if (push.ok) {
      onMessage?.(`${preset.title} är aktiverad kl. ${preset.time}. Pushnotiser är aktiverade.`)
    } else if (push.permission === 'denied') {
      onMessage?.(`${preset.title} är sparad, men notiser är blockerade på enheten. Tillåt notiser i iPhone-inställningarna.`)
    } else if (push.permission === 'unsupported') {
      onMessage?.(`${preset.title} är sparad. Pushnotiser kräver att Viktkollen körs som en installerad webbapp på en iPhone som stöder webbpush.`)
    } else {
      onMessage?.(`${preset.title} är sparad, men pushnotiser kunde inte aktiveras. Tryck på Aktivera systemnotiser och försök igen.`)
    }
  }

  return (
    <section className="notice-card" aria-labelledby="ready-reminders-heading">
      <h2 id="ready-reminders-heading">Färdiga larm – ett tryck</h2>
      <p>Tryck en gång för att aktivera. Första gången frågar iPhone om tillåtelse för notiser.</p>
      <div className="notice-suggestions">
        {quickPresets.map((preset) => (
          <button key={`${preset.title}-${preset.time}`} type="button" onClick={() => activatePreset(preset)}>
            {preset.title} · {preset.time} · {repeatLabel(preset)}
          </button>
        ))}
      </div>
      <p className="estimate-note">Alla larm får snooze 1–10, 15 eller 20 minuter.</p>
    </section>
  )
}

export default NoticeQuickPresets
