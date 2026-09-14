import { useEffect, useMemo, useRef, useState } from 'react'
import {
  enableReminderBackgroundPush,
  removeKitchenTimerPushSchedule,
  upsertKitchenTimerPushSchedule,
} from '../services/reminders/reminderPushSync.js'

const appliances = ['Micro', 'Spis', 'Ugn', 'Kylskåp', 'Tvättmaskin']
const secondOptions = Array.from({ length: 10 }, (_, index) => index + 1)
const minuteOptions = Array.from({ length: 30 }, (_, index) => index + 1)
const rooms = [
  { id: 'kitchen', label: 'Kök' },
  { id: 'bedroom', label: 'Sovrum' },
  { id: 'wardrobe', label: 'Garderob' },
  { id: 'bathroom', label: 'Badrum' },
]

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function NoticeKitchenTimers({ onMessage }) {
  const [openRoom, setOpenRoom] = useState('')
  const [selectedAppliance, setSelectedAppliance] = useState('Micro')
  const [timers, setTimers] = useState([])
  const [, setClock] = useState(Date.now())
  const timeoutIds = useRef(new Map())

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => () => {
    timeoutIds.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    timeoutIds.current.clear()
  }, [])

  const activeTimers = useMemo(() => timers.filter((timer) => !timer.done), [timers])

  function notify(timer) {
    setTimers((current) => current.map((item) => item.id === timer.id ? { ...item, done: true } : item))
    timeoutIds.current.delete(timer.id)
    onMessage?.(`${timer.appliance}-timern är klar.`)

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(`${timer.appliance} – timer klar`, {
        body: `Dags att kontrollera ${timer.appliance.toLowerCase()}.`,
        tag: `kitchen-timer-${timer.id}`,
      })
    }
  }

  async function scheduleBackgroundPush(timer) {
    const permission = await enableReminderBackgroundPush()
    if (permission.error) return { error: permission.error }
    return upsertKitchenTimerPushSchedule({
      appliance: timer.appliance,
      endsAt: timer.endsAt,
      timerId: timer.id,
    })
  }

  async function startTimer(amount, unit) {
    const durationMs = unit === 'seconds' ? amount * 1000 : amount * 60000
    const now = Date.now()
    const timer = {
      appliance: selectedAppliance,
      done: false,
      durationMs,
      endsAt: now + durationMs,
      id: `kitchen-${selectedAppliance.toLowerCase()}-${now}`,
      unit,
    }

    setTimers((current) => [...current, timer])
    const timeoutId = window.setTimeout(() => notify(timer), durationMs)
    timeoutIds.current.set(timer.id, timeoutId)

    if (unit === 'minutes') {
      const pushResult = await scheduleBackgroundPush(timer)
      if (pushResult.error) {
        onMessage?.(`${selectedAppliance}: ${amount} min startad. Bakgrundsnotisen kunde inte aktiveras: ${pushResult.error.message}`)
        return
      }
      onMessage?.(`${selectedAppliance}: ${amount} min startad med bakgrundsnotis.`)
      return
    }

    onMessage?.(`${selectedAppliance}: ${amount} sek startad. Sekundtimer fungerar när Viktkollen är öppen.`)
  }

  async function snooze(timer, minutes = 5) {
    const previousTimeout = timeoutIds.current.get(timer.id)
    if (previousTimeout) window.clearTimeout(previousTimeout)
    const next = { ...timer, done: false, endsAt: Date.now() + minutes * 60000, unit: 'minutes' }
    setTimers((current) => current.map((item) => item.id === timer.id ? next : item))
    const timeoutId = window.setTimeout(() => notify(next), minutes * 60000)
    timeoutIds.current.set(timer.id, timeoutId)

    const pushResult = await scheduleBackgroundPush(next)
    if (pushResult.error) {
      onMessage?.(`${timer.appliance} snoozad ${minutes} min lokalt. Bakgrundsnotisen kunde inte uppdateras.`)
      return
    }
    onMessage?.(`${timer.appliance} snoozad ${minutes} min med bakgrundsnotis.`)
  }

  async function complete(timer) {
    const timeoutId = timeoutIds.current.get(timer.id)
    if (timeoutId) window.clearTimeout(timeoutId)
    timeoutIds.current.delete(timer.id)
    setTimers((current) => current.filter((item) => item.id !== timer.id))
    await removeKitchenTimerPushSchedule(timer.id).catch(() => undefined)
  }

  function toggleRoom(roomId) {
    setOpenRoom((current) => current === roomId ? '' : roomId)
  }

  return (
    <section className="notice-card" aria-labelledby="room-timers-heading">
      <h2 id="room-timers-heading">Rum & snabbknappar</h2>
      <p>Varje rum har en egen sektion. Bara det rum du öppnar visas, så Notis hålls ren.</p>

      <div className="notice-suggestions" aria-label="Rum">
        {rooms.map((room) => (
          <button key={room.id} type="button" aria-expanded={openRoom === room.id} aria-pressed={openRoom === room.id} onClick={() => toggleRoom(room.id)}>
            {room.label}{room.id === 'kitchen' && activeTimers.length ? ` · ${activeTimers.length} aktiv${activeTimers.length === 1 ? '' : 'a'}` : ''}
          </button>
        ))}
      </div>

      {openRoom === 'kitchen' && <div className="notice-room-panel" aria-labelledby="kitchen-timers-heading">
        <div className="notice-actions">
          <h3 id="kitchen-timers-heading">Kök – snabbtimer</h3>
          <button type="button" onClick={() => setOpenRoom('')}>Stäng</button>
        </div>
        <p>Välj sak och starta direkt. Micro och övriga kan använda både sekunder och minuter.</p>

        <div className="notice-suggestions" aria-label="Kökssaker">
          {appliances.map((appliance) => (
            <button key={appliance} type="button" aria-pressed={selectedAppliance === appliance} onClick={() => setSelectedAppliance(appliance)}>
              {appliance}
            </button>
          ))}
        </div>

        <h3>{selectedAppliance} · sekunder</h3>
        <div className="notice-suggestions">
          {secondOptions.map((seconds) => <button key={`sec-${seconds}`} type="button" onClick={() => startTimer(seconds, 'seconds')}>{seconds} sek</button>)}
        </div>

        <h3>{selectedAppliance} · minuter</h3>
        <div className="notice-suggestions">
          {minuteOptions.map((minutes) => <button key={`min-${minutes}`} type="button" onClick={() => startTimer(minutes, 'minutes')}>{minutes} min</button>)}
        </div>

        {activeTimers.length > 0 && <div className="notice-kitchen-active">
          <h3>Aktiva timers</h3>
          <ul className="notice-reminder-list">
            {activeTimers.map((timer) => (
              <li key={timer.id}>
                <strong>{timer.appliance}</strong>
                <span>{formatRemaining(timer.endsAt - Date.now())} kvar</span>
                <div className="notice-actions">
                  <button type="button" onClick={() => snooze(timer, 5)}>Snooze 5 min</button>
                  <button type="button" onClick={() => complete(timer)}>Klar</button>
                </div>
              </li>
            ))}
          </ul>
        </div>}

        <p className="estimate-note">Minuttimers använder Viktkollens bakgrunds-push och kan ge notis även när appen inte är öppen. Sekundtimers 1–10 sek körs direkt i appen och kräver att den är öppen.</p>
      </div>}

      {openRoom === 'bedroom' && <div className="notice-room-panel" aria-labelledby="bedroom-heading">
        <div className="notice-actions"><h3 id="bedroom-heading">Sovrum</h3><button type="button" onClick={() => setOpenRoom('')}>Stäng</button></div>
        <p>Här samlar vi väckarklocka, mjuk väckning och sovrumsrelaterade snabbknappar.</p>
        <div className="notice-suggestions">
          <button type="button" onClick={() => onMessage?.('Väckarklockan byggs som nästa del i Notis.')}>Väckarklocka</button>
          <button type="button" onClick={() => onMessage?.('Mjuk väckning: viskning → högre röst → larm kommer i nästa steg.')}>Mjuk väckning</button>
        </div>
      </div>}

      {openRoom === 'wardrobe' && <div className="notice-room-panel" aria-labelledby="wardrobe-heading">
        <div className="notice-actions"><h3 id="wardrobe-heading">Garderob</h3><button type="button" onClick={() => setOpenRoom('')}>Stäng</button></div>
        <p>Här kommer klädhjälpen: vad du bar senast, plagg du glömt och förslag på vad du kan byta idag.</p>
        <div className="notice-suggestions">
          <button type="button" onClick={() => onMessage?.('Klädhistorik kopplas till AI Ögat i garderobsdelen senare.')}>Klädhistorik</button>
          <button type="button" onClick={() => onMessage?.('Klädförslag kopplas till AI Ögat i garderobsdelen senare.')}>Klädförslag</button>
        </div>
      </div>}

      {openRoom === 'bathroom' && <div className="notice-room-panel" aria-labelledby="bathroom-heading">
        <div className="notice-actions"><h3 id="bathroom-heading">Badrum</h3><button type="button" onClick={() => setOpenRoom('')}>Stäng</button></div>
        <p>Snabbvägar för hygienpåminnelser. De vanliga färdiga larmen ovan fortsätter användas för tider och upprepning.</p>
        <div className="notice-suggestions">
          <button type="button" onClick={() => onMessage?.('Använd färdiga larmet Tandborstning ovan för att aktivera tiden.')}>Tandborstning</button>
          <button type="button" onClick={() => onMessage?.('Använd färdiga larmet Dusch ovan för att aktivera tiden.')}>Dusch</button>
          <button type="button" onClick={() => onMessage?.('Använd färdiga larmet Hudkräm ovan för att aktivera tiden.')}>Hudkräm</button>
          <button type="button" onClick={() => onMessage?.('Använd färdiga larmet Rakning ovan för att aktivera tiden.')}>Rakning</button>
        </div>
      </div>}
    </section>
  )
}

export default NoticeKitchenTimers
