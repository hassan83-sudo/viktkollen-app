import { useEffect, useMemo, useRef, useState } from 'react'

const appliances = ['Micro', 'Spis', 'Ugn', 'Kylskåp', 'Tvättmaskin']
const secondOptions = Array.from({ length: 10 }, (_, index) => index + 1)
const minuteOptions = Array.from({ length: 30 }, (_, index) => index + 1)

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function NoticeKitchenTimers({ onMessage }) {
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
      new Notification(`${timer.appliance} – timer klar`, { body: `Dags att kontrollera ${timer.appliance.toLowerCase()}.`, tag: `kitchen-timer-${timer.id}` })
    }
  }

  function startTimer(amount, unit) {
    const durationMs = unit === 'seconds' ? amount * 1000 : amount * 60000
    const now = Date.now()
    const timer = {
      appliance: selectedAppliance,
      done: false,
      durationMs,
      endsAt: now + durationMs,
      id: `kitchen-${selectedAppliance.toLowerCase()}-${now}`,
    }
    setTimers((current) => [...current, timer])
    const timeoutId = window.setTimeout(() => notify(timer), durationMs)
    timeoutIds.current.set(timer.id, timeoutId)
    onMessage?.(`${selectedAppliance}: ${amount} ${unit === 'seconds' ? 'sek' : 'min'} startad.`)
  }

  function snooze(timer, minutes = 5) {
    const previousTimeout = timeoutIds.current.get(timer.id)
    if (previousTimeout) window.clearTimeout(previousTimeout)
    const next = { ...timer, done: false, endsAt: Date.now() + minutes * 60000 }
    setTimers((current) => current.map((item) => item.id === timer.id ? next : item))
    const timeoutId = window.setTimeout(() => notify(next), minutes * 60000)
    timeoutIds.current.set(timer.id, timeoutId)
    onMessage?.(`${timer.appliance} snoozad ${minutes} min.`)
  }

  function complete(timer) {
    const timeoutId = timeoutIds.current.get(timer.id)
    if (timeoutId) window.clearTimeout(timeoutId)
    timeoutIds.current.delete(timer.id)
    setTimers((current) => current.filter((item) => item.id !== timer.id))
  }

  return (
    <section className="notice-card" aria-labelledby="kitchen-timers-heading">
      <h2 id="kitchen-timers-heading">Kök – snabbtimer</h2>
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
      <p className="estimate-note">Timers fungerar direkt när Viktkollen är öppen. Bakgrundslarm kopplas till samma pushsystem i nästa steg.</p>
    </section>
  )
}

export default NoticeKitchenTimers
