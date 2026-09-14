import { useEffect, useMemo, useRef, useState } from 'react'
import {
  enableReminderBackgroundPush,
  removeKitchenTimerPushSchedule,
  upsertKitchenTimerPushSchedule,
} from '../services/reminders/reminderPushSync.js'
import NoticeWardrobeHelper from './NoticeWardrobeHelper.jsx'
import NoticeBathroomHelper from './NoticeBathroomHelper.jsx'
import NoticeLivingRoomHelper from './NoticeLivingRoomHelper.jsx'
import NoticeHallHelper from './NoticeHallHelper.jsx'
import NoticeLaundryHelper from './NoticeLaundryHelper.jsx'
import NoticeCleaningHelper from './NoticeCleaningHelper.jsx'

const appliances = ['Micro', 'Spis', 'Ugn', 'Kylskåp', 'Tvättmaskin']
const secondOptions = Array.from({ length: 10 }, (_, index) => index + 1)
const minuteOptions = Array.from({ length: 30 }, (_, index) => index + 1)
const rooms = [
  { id: 'kitchen', label: 'Kök' },
  { id: 'bedroom', label: 'Sovrum' },
  { id: 'wardrobe', label: 'Garderob' },
  { id: 'bathroom', label: 'Badrum' },
  { id: 'living-room', label: 'Vardagsrum' },
  { id: 'hall', label: 'Hall / Entré' },
  { id: 'laundry', label: 'Tvätt' },
  { id: 'cleaning', label: 'Städning' },
]

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function nextClockTime(time) {
  const [hours, minutes] = String(time || '07:00').split(':').map(Number)
  const now = new Date(); const target = new Date(now); target.setHours(hours, minutes, 0, 0); if (target <= now) target.setDate(target.getDate() + 1); return target
}

function NoticeKitchenTimers({ reminderState, onRemindersChange, onMessage }) {
  const [openRoom, setOpenRoom] = useState(''); const [selectedAppliance, setSelectedAppliance] = useState('Micro'); const [timers, setTimers] = useState([]); const [alarmTime, setAlarmTime] = useState('07:00'); const [wakeMode, setWakeMode] = useState('gentle'); const [wakeAlarm, setWakeAlarm] = useState(null); const [, setClock] = useState(Date.now()); const timeoutIds = useRef(new Map()); const alarmTimeout = useRef(null); const wakeSequenceTimeouts = useRef([])
  useEffect(() => { const interval = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(interval) }, [])
  useEffect(() => () => { timeoutIds.current.forEach((timeoutId) => window.clearTimeout(timeoutId)); timeoutIds.current.clear(); if (alarmTimeout.current) window.clearTimeout(alarmTimeout.current); wakeSequenceTimeouts.current.forEach((timeoutId) => window.clearTimeout(timeoutId)) }, [])
  const activeTimers = useMemo(() => timers.filter((timer) => !timer.done), [timers])
  function notify(timer) { setTimers((current) => current.map((item) => item.id === timer.id ? { ...item, done: true } : item)); timeoutIds.current.delete(timer.id); onMessage?.(`${timer.appliance}-timern är klar.`); if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(`${timer.appliance} – timer klar`, { body: `Dags att kontrollera ${timer.appliance.toLowerCase()}.`, tag: `kitchen-timer-${timer.id}` }) }
  async function scheduleBackgroundPush(timer) { const permission = await enableReminderBackgroundPush(); if (permission.error) return { error: permission.error }; return upsertKitchenTimerPushSchedule({ appliance: timer.appliance, endsAt: timer.endsAt, timerId: timer.id }) }
  async function startTimer(amount, unit) { const durationMs = unit === 'seconds' ? amount * 1000 : amount * 60000; const now = Date.now(); const timer = { appliance: selectedAppliance, done: false, durationMs, endsAt: now + durationMs, id: `kitchen-${selectedAppliance.toLowerCase()}-${now}`, unit }; setTimers((current) => [...current, timer]); const timeoutId = window.setTimeout(() => notify(timer), durationMs); timeoutIds.current.set(timer.id, timeoutId); if (unit === 'minutes') { const pushResult = await scheduleBackgroundPush(timer); if (pushResult.error) { onMessage?.(`${selectedAppliance}: ${amount} min startad. Bakgrundsnotisen kunde inte aktiveras: ${pushResult.error.message}`); return } onMessage?.(`${selectedAppliance}: ${amount} min startad med bakgrundsnotis.`); return } onMessage?.(`${selectedAppliance}: ${amount} sek startad. Sekundtimer fungerar när Viktkollen är öppen.`) }
  async function snooze(timer, minutes = 5) { const previousTimeout = timeoutIds.current.get(timer.id); if (previousTimeout) window.clearTimeout(previousTimeout); const next = { ...timer, done: false, endsAt: Date.now() + minutes * 60000, unit: 'minutes' }; setTimers((current) => current.map((item) => item.id === timer.id ? next : item)); const timeoutId = window.setTimeout(() => notify(next), minutes * 60000); timeoutIds.current.set(timer.id, timeoutId); const pushResult = await scheduleBackgroundPush(next); if (pushResult.error) { onMessage?.(`${timer.appliance} snoozad ${minutes} min lokalt. Bakgrundsnotisen kunde inte uppdateras.`); return } onMessage?.(`${timer.appliance} snoozad ${minutes} min med bakgrundsnotis.`) }
  async function complete(timer) { const timeoutId = timeoutIds.current.get(timer.id); if (timeoutId) window.clearTimeout(timeoutId); timeoutIds.current.delete(timer.id); setTimers((current) => current.filter((item) => item.id !== timer.id)); await removeKitchenTimerPushSchedule(timer.id).catch(() => undefined) }
  function clearWakeSequence() { wakeSequenceTimeouts.current.forEach((timeoutId) => window.clearTimeout(timeoutId)); wakeSequenceTimeouts.current = []; if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel() }
  function speakWake(text, volume) { if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return; const utterance = new SpeechSynthesisUtterance(text); utterance.lang = typeof document !== 'undefined' ? (document.documentElement?.lang || 'sv-SE') : 'sv-SE'; utterance.volume = Math.max(0, Math.min(1, volume)); utterance.rate = 0.88; window.speechSynthesis.speak(utterance) }
  function runWakeSequence(alarm) { clearWakeSequence(); const gentleSteps = [{ delay: 0, text: 'God morgon. Det är dags att vakna.', volume: 0.2 }, { delay: 12000, text: 'God morgon. Försök vakna nu.', volume: 0.35 }, { delay: 24000, text: 'Det är dags att gå upp.', volume: 0.55 }, { delay: 36000, text: 'Vakna nu. Ditt väckningslarm har gått.', volume: 0.8 }]; const normalSteps = [{ delay: 0, text: 'God morgon. Det är dags att vakna.', volume: 0.55 }, { delay: 12000, text: 'Vakna nu. Det är dags att gå upp.', volume: 0.85 }]; const steps = alarm.mode === 'gentle' ? gentleSteps : normalSteps; steps.forEach((step) => { const timeoutId = window.setTimeout(() => { speakWake(step.text, step.volume); if (step === steps[steps.length - 1] && typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('Väckarklocka', { body: 'Dags att vakna.', tag: `wake-${alarm.id}` }) }, step.delay); wakeSequenceTimeouts.current.push(timeoutId) }) }
  async function activateWakeAlarm() { const target = nextClockTime(alarmTime); const id = `wake-${target.getTime()}`; const alarm = { id, mode: wakeMode, time: alarmTime, endsAt: target.getTime() }; if (alarmTimeout.current) window.clearTimeout(alarmTimeout.current); clearWakeSequence(); setWakeAlarm(alarm); alarmTimeout.current = window.setTimeout(() => runWakeSequence(alarm), Math.max(0, target.getTime() - Date.now())); const pushResult = await scheduleBackgroundPush({ appliance: 'Väckarklocka', endsAt: alarm.endsAt, id }); if (pushResult.error) { onMessage?.(`Väckarklocka ${alarmTime} är satt i appen. Bakgrundsnotisen kunde inte aktiveras.`); return } onMessage?.(`Väckarklocka satt till ${alarmTime}. ${wakeMode === 'gentle' ? 'Mjuk väckning börjar lågt och höjs stegvis.' : 'Normal väckning är vald.'}`) }
  async function snoozeWake(minutes = 5) { if (!wakeAlarm) return; if (alarmTimeout.current) window.clearTimeout(alarmTimeout.current); clearWakeSequence(); const next = { ...wakeAlarm, endsAt: Date.now() + minutes * 60000 }; setWakeAlarm(next); alarmTimeout.current = window.setTimeout(() => runWakeSequence(next), minutes * 60000); await scheduleBackgroundPush({ appliance: 'Väckarklocka', endsAt: next.endsAt, id: next.id }); onMessage?.(`Väckarklockan snoozad ${minutes} min.`) }
  async function stopWakeAlarm() { if (!wakeAlarm) return; if (alarmTimeout.current) window.clearTimeout(alarmTimeout.current); alarmTimeout.current = null; clearWakeSequence(); await removeKitchenTimerPushSchedule(wakeAlarm.id).catch(() => undefined); setWakeAlarm(null); onMessage?.('Väckarklockan är avstängd.') }
  function toggleRoom(roomId) { setOpenRoom((current) => current === roomId ? '' : roomId) }

  return <section className="notice-card" aria-labelledby="room-timers-heading">
    <h2 id="room-timers-heading">Rum & snabbknappar</h2><p>Varje rum har en egen sektion. Bara det rum du öppnar visas, så Notis hålls ren.</p>
    <div className="notice-suggestions" aria-label="Rum">{rooms.map((room) => <button key={room.id} type="button" aria-expanded={openRoom === room.id} aria-pressed={openRoom === room.id} onClick={() => toggleRoom(room.id)}>{room.label}{room.id === 'kitchen' && activeTimers.length ? ` · ${activeTimers.length} aktiv${activeTimers.length === 1 ? '' : 'a'}` : ''}{room.id === 'bedroom' && wakeAlarm ? ' · larm satt' : ''}</button>)}</div>
    {openRoom === 'kitchen' && <div className="notice-room-panel" aria-labelledby="kitchen-timers-heading"><div className="notice-actions"><h3 id="kitchen-timers-heading">Kök – snabbtimer</h3><button type="button" onClick={() => setOpenRoom('')}>Stäng</button></div><p>Välj sak och starta direkt. Micro och övriga kan använda både sekunder och minuter.</p><div className="notice-suggestions" aria-label="Kökssaker">{appliances.map((appliance) => <button key={appliance} type="button" aria-pressed={selectedAppliance === appliance} onClick={() => setSelectedAppliance(appliance)}>{appliance}</button>)}</div><h3>{selectedAppliance} · sekunder</h3><div className="notice-suggestions">{secondOptions.map((seconds) => <button key={`sec-${seconds}`} type="button" onClick={() => startTimer(seconds, 'seconds')}>{seconds} sek</button>)}</div><h3>{selectedAppliance} · minuter</h3><div className="notice-suggestions">{minuteOptions.map((minutes) => <button key={`min-${minutes}`} type="button" onClick={() => startTimer(minutes, 'minutes')}>{minutes} min</button>)}</div>{activeTimers.length > 0 && <div className="notice-kitchen-active"><h3>Aktiva timers</h3><ul className="notice-reminder-list">{activeTimers.map((timer) => <li key={timer.id}><strong>{timer.appliance}</strong><span>{formatRemaining(timer.endsAt - Date.now())} kvar</span><div className="notice-actions"><button type="button" onClick={() => snooze(timer, 5)}>Snooze 5 min</button><button type="button" onClick={() => complete(timer)}>Klar</button></div></li>)}</ul></div>}<p className="estimate-note">Minuttimers använder Viktkollens bakgrunds-push och kan ge notis även när appen inte är öppen. Sekundtimers 1–10 sek körs direkt i appen och kräver att den är öppen.</p></div>}
    {openRoom === 'bedroom' && <div className="notice-room-panel" aria-labelledby="bedroom-heading"><div className="notice-actions"><h3 id="bedroom-heading">Sovrum – väckarklocka</h3><button type="button" onClick={() => setOpenRoom('')}>Stäng</button></div><p>Välj tid och hur mjukt du vill bli väckt.</p><div className="notice-form-grid"><label>Väckningstid<input type="time" value={alarmTime} onChange={(event) => setAlarmTime(event.target.value)} /></label><label>Väckning<select value={wakeMode} onChange={(event) => setWakeMode(event.target.value)}><option value="gentle">Mjuk: låg röst → högre → larm</option><option value="normal">Normal: röst → högre röst</option></select></label></div><div className="notice-actions"><button className="primary-button" type="button" onClick={activateWakeAlarm}>Sätt väckarklocka</button>{wakeAlarm && <button type="button" onClick={() => snoozeWake(5)}>Snooze 5 min</button>}{wakeAlarm && <button type="button" onClick={stopWakeAlarm}>Stäng av</button>}</div>{wakeAlarm && <p className="notice-confirmation" role="status">Väckarklocka {wakeAlarm.time} · {wakeAlarm.mode === 'gentle' ? 'mjuk väckning' : 'normal väckning'}.</p>}<p className="estimate-note">När Viktkollen är öppen används stegvis systemröst. Bakgrund/lock screen får pushnotis; webbläsaren kan inte garantera att tal spelas automatiskt när iPhone är låst.</p></div>}
    {openRoom === 'wardrobe' && <NoticeWardrobeHelper onClose={() => setOpenRoom('')} onMessage={onMessage} />}
    {openRoom === 'bathroom' && <NoticeBathroomHelper reminderState={reminderState} onRemindersChange={onRemindersChange} onClose={() => setOpenRoom('')} onMessage={onMessage} />}
    {openRoom === 'living-room' && <NoticeLivingRoomHelper reminderState={reminderState} onRemindersChange={onRemindersChange} onClose={() => setOpenRoom('')} onMessage={onMessage} />}
    {openRoom === 'hall' && <NoticeHallHelper reminderState={reminderState} onRemindersChange={onRemindersChange} onClose={() => setOpenRoom('')} onMessage={onMessage} />}
    {openRoom === 'laundry' && <NoticeLaundryHelper reminderState={reminderState} onRemindersChange={onRemindersChange} onClose={() => setOpenRoom('')} onMessage={onMessage} />}
    {openRoom === 'cleaning' && <NoticeCleaningHelper reminderState={reminderState} onRemindersChange={onRemindersChange} onClose={() => setOpenRoom('')} onMessage={onMessage} />}
  </section>
}

export default NoticeKitchenTimers
