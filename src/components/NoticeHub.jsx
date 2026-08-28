import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { archiveReminder, completeReminder, pauseReminder, resumeReminder, snoozeReminder } from '../services/reminders/reminderActions.js'
import { normalizeReminder, normalizeReminderState, weekDays } from '../services/reminders/reminderModel.js'
import { getNextReminderAt } from '../services/reminders/reminderScheduler.js'
import { getReminderCapabilities, readReminderSpeechSettings, saveReminderSpeechSettings } from '../services/reminders/reminderCapabilities.js'
import { requestReminderNotificationPermission } from '../services/reminders/reminderNotifications.js'
import {
  addBatteryMeasurement,
  createBatteryRecommendation,
  getBatteryCapabilities,
  readBatteryNoticeState,
  saveBatteryNoticeState,
} from '../services/battery/batteryNoticeModel.js'

const suggestions = ['glasses', 'medicine', 'water', 'item', 'leave', 'call', 'laundry', 'pause', 'bed']

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function currentWeekday() {
  return weekDays[(new Date().getDay() + 6) % 7]
}

function createEmptyDraft() {
  return { daysOfWeek: [], description: '', scheduleType: 'once', startDate: localDate(), time: '09:00', title: '' }
}

function NoticeHub({ onRemindersChange, reminderState }) {
  const { t, i18n } = useTranslation('notices')
  const state = useMemo(() => normalizeReminderState(reminderState), [reminderState])
  const formRef = useRef(null)
  const titleInputRef = useRef(null)
  const [draft, setDraft] = useState(createEmptyDraft)
  const [selectedSuggestion, setSelectedSuggestion] = useState('')
  const [editingId, setEditingId] = useState('')
  const [deleteId, setDeleteId] = useState('')
  const [message, setMessage] = useState('')
  const [technique, setTechnique] = useState('')
  const [speechSettings, setSpeechSettings] = useState(readReminderSpeechSettings)
  const [batteryState, setBatteryState] = useState(readBatteryNoticeState)
  const capabilities = getReminderCapabilities()
  const batteryCapabilities = getBatteryCapabilities()
  const batteryRecommendation = useMemo(() => createBatteryRecommendation(batteryState), [batteryState])

  function focusForm() {
    window.requestAnimationFrame?.(() => {
      formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      titleInputRef.current?.focus()
    })
  }

  function save(next, status) {
    onRemindersChange?.(normalizeReminderState(next))
    setMessage(status)
  }

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function selectSuggestion(id) {
    setSelectedSuggestion(id)
    setEditingId('')
    setDraft((current) => ({ ...current, description: '', title: t(`suggestions.${id}`) }))
  }

  function prepareDraft(nextDraft, status) {
    setSelectedSuggestion('')
    setEditingId('')
    setDraft((current) => ({ ...current, ...nextDraft }))
    setMessage(status)
    focusForm()
  }

  function submit(event) {
    event.preventDefault()
    const now = new Date().toISOString()
    const reminder = normalizeReminder({
      ...draft,
      createdAt: editingId ? state.reminders.find((item) => item.id === editingId)?.createdAt : now,
      id: editingId || `reminder-${now}`,
      source: 'reminder_hub',
      updatedAt: now,
    }, { now })
    save({
      ...state,
      reminders: [...state.reminders.filter((item) => item.id !== reminder.id), reminder],
      updatedAt: now,
    }, t(editingId ? 'status.saved' : 'status.created'))
    setSelectedSuggestion('')
    setEditingId('')
    setDraft(createEmptyDraft())
  }

  function edit(reminder) {
    setEditingId(reminder.id)
    setSelectedSuggestion('')
    setDraft({
      daysOfWeek: reminder.daysOfWeek,
      description: reminder.description,
      scheduleType: reminder.scheduleType,
      startDate: reminder.startDate,
      time: reminder.time,
      title: reminder.title,
    })
    focusForm()
  }

  async function requestPermission() {
    const result = await requestReminderNotificationPermission()
    setMessage(result.ok ? t('capabilities.permissionGranted') : t(`capabilities.permission${result.permission === 'unsupported' ? 'Unsupported' : 'Denied'}`))
  }

  function updateSpeech(key, value) {
    const next = saveReminderSpeechSettings({ ...speechSettings, [key]: value })
    setSpeechSettings(next)
  }

  function previewSpeech() {
    if (!capabilities.speech || !speechSettings.enabled) return
    const text = speechSettings.includeSensitiveText ? (draft.title || t('speech.previewNeutral')) : t('speech.previewNeutral')
    window.dispatchEvent(new CustomEvent('viktkollen:ambient-audio-interruption', { detail: { active: true } }))
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = i18n.language || 'sv-SE'
    utterance.onend = utterance.onerror = () => window.dispatchEvent(new CustomEvent('viktkollen:ambient-audio-interruption', { detail: { active: false } }))
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  function updateBattery(next, status = '') {
    setBatteryState(saveBatteryNoticeState(next))
    if (status) setMessage(status)
  }

  function activateBattery(enabled) {
    const now = new Date().toISOString()
    updateBattery({
      ...batteryState,
      activatedAt: enabled && !batteryState.activatedAt ? now : batteryState.activatedAt,
      enabled,
      updatedAt: now,
    }, t(enabled ? 'battery.status.enabled' : 'battery.status.disabled'))
  }

  function saveManualBattery() {
    const percent = Number(batteryState.manualPercent)
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setMessage(t('battery.status.invalidPercent'))
      return
    }
    updateBattery(addBatteryMeasurement(batteryState, {
      charging: false,
      measuredAt: new Date().toISOString(),
      percent,
      source: 'manual',
    }), t('battery.status.savedManual'))
  }

  async function readBatteryApi() {
    const navigatorObject = typeof window === 'undefined' ? null : window.navigator
    if (!batteryCapabilities.batteryApi || typeof navigatorObject?.getBattery !== 'function') {
      setMessage(t('battery.status.apiUnavailable'))
      return
    }
    try {
      const battery = await navigatorObject.getBattery()
      updateBattery(addBatteryMeasurement(batteryState, {
        charging: Boolean(battery.charging),
        measuredAt: new Date().toISOString(),
        percent: Math.round((Number(battery.level) || 0) * 100),
        source: 'api',
      }), t('battery.status.savedApi'))
    } catch {
      setMessage(t('battery.status.apiUnavailable'))
    }
  }

  function prepareBatteryReminder() {
    prepareDraft({
      description: t('battery.reminder.description', { percent: batteryRecommendation.reminderPercent || 35 }),
      scheduleType: 'once',
      startDate: localDate(),
      time: '20:00',
      title: t('battery.reminder.title'),
    }, t('battery.status.reminderPrepared'))
  }

  function prepareMemoryReminder(id) {
    prepareDraft({
      description: `${t(`memory.techniques.${id}.body`)} ${t(`memory.techniques.${id}.example`)}`,
      scheduleType: 'once',
      startDate: localDate(),
      title: t(`memory.techniques.${id}.reminder`),
    }, t('memory.reminderPrepared'))
  }

  return (
    <section className="notice-hub" aria-labelledby="notice-hub-heading">
      <header className="notice-hub-heading">
        <p className="eyebrow">{t('eyebrow')}</p>
        <h1 id="notice-hub-heading">{t('title')}</h1>
        <p>{t('subtitle')}</p>
      </header>
      {message && <p className="form-success" role="status" aria-live="polite">{message}</p>}

      <section className="notice-card" aria-labelledby="quick-reminders-heading">
        <h2 id="quick-reminders-heading">{t('quick.title')}</h2>
        <p>{t('quick.body')}</p>
        <div className="notice-suggestions">
          {suggestions.map((id) => <button aria-pressed={selectedSuggestion === id} key={id} type="button" onClick={() => selectSuggestion(id)}>{t(`suggestions.${id}`)}</button>)}
        </div>
        {selectedSuggestion && <p className="notice-confirmation" role="status">{t('quick.confirmation', { date: draft.startDate, text: draft.title, time: draft.time, repeat: t(`repeat.${draft.scheduleType}`) })}</p>}
      </section>

      <form className="notice-card notice-form" onSubmit={submit} ref={formRef}>
        <h2>{t(editingId ? 'form.editTitle' : 'form.title')}</h2>
        <label>{t('form.text')}<input ref={titleInputRef} required value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} /></label>
        <label>{t('form.description')}<textarea rows="3" value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} /></label>
        <div className="notice-form-grid">
          <label>{t('form.date')}<input type="date" required value={draft.startDate} onChange={(event) => updateDraft('startDate', event.target.value)} /></label>
          <label>{t('form.time')}<input type="time" required value={draft.time} onChange={(event) => updateDraft('time', event.target.value)} /></label>
          <label>{t('form.repeat')}<select value={draft.scheduleType} onChange={(event) => {
            const scheduleType = event.target.value
            setDraft((current) => ({
              ...current,
              daysOfWeek: scheduleType === 'weekly' && current.daysOfWeek.length === 0 ? [currentWeekday()] : current.daysOfWeek,
              scheduleType,
            }))
          }}>
            {['once', 'daily', 'selected_weekdays', 'weekly'].map((type) => <option key={type} value={type}>{t(`repeat.${type}`)}</option>)}
          </select></label>
        </div>
        {['selected_weekdays', 'weekly'].includes(draft.scheduleType) && <fieldset><legend>{t('form.weekdays')}</legend><div className="notice-weekdays">{weekDays.map((day) => <label key={day}><input type="checkbox" checked={draft.daysOfWeek.includes(day)} onChange={(event) => updateDraft('daysOfWeek', event.target.checked ? [...draft.daysOfWeek, day] : draft.daysOfWeek.filter((item) => item !== day))} />{t(`weekdays.${day}`)}</label>)}</div></fieldset>}
        <div className="notice-actions">
          <button className="primary-button" type="submit">{t(editingId ? 'form.save' : 'form.activate')}</button>
          {(editingId || draft.title || draft.description) && <button type="button" onClick={() => { setEditingId(''); setSelectedSuggestion(''); setDraft(createEmptyDraft()) }}>{t('form.cancel')}</button>}
        </div>
      </form>

      <section className="notice-card" aria-labelledby="saved-reminders-heading">
        <h2 id="saved-reminders-heading">{t('saved.title')}</h2>
        {state.reminders.length === 0 ? <p>{t('saved.empty')}</p> : <ul className="notice-reminder-list">{state.reminders.filter((item) => !item.archivedAt).map((reminder) => <li key={reminder.id}>
          <strong>{reminder.title}</strong><span>{t('saved.schedule', { date: reminder.startDate, time: reminder.time, repeat: t(`repeat.${reminder.scheduleType}`) })}</span><span>{t('saved.next', { time: getNextReminderAt(reminder) ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(getNextReminderAt(reminder))) : t('saved.none') })}</span>
          <div className="notice-actions">
            <button type="button" onClick={() => edit(reminder)}>{t('actions.edit')}</button>
            <button type="button" onClick={() => save(reminder.pausedAt ? resumeReminder(state, reminder.id) : pauseReminder(state, reminder.id), t(reminder.pausedAt ? 'status.enabled' : 'status.disabled'))}>{t(reminder.pausedAt ? 'actions.enable' : 'actions.disable')}</button>
            <button type="button" onClick={() => save(completeReminder(state, reminder.id), t('status.completed'))}>{t('actions.complete')}</button>
            <button type="button" onClick={() => save(snoozeReminder(state, reminder.id, 30), t('status.snoozed'))}>{t('actions.snooze')}</button>
            <button type="button" onClick={() => setDeleteId(reminder.id)}>{t('actions.delete')}</button>
          </div>
          {deleteId === reminder.id && <div className="notice-delete-confirm" role="alert"><p>{t('delete.confirm')}</p><button type="button" onClick={() => save(archiveReminder(state, reminder.id), t('status.deleted'))}>{t('delete.yes')}</button><button type="button" onClick={() => setDeleteId('')}>{t('delete.no')}</button></div>}
        </li>)}</ul>}
      </section>

      <section className="notice-card" aria-labelledby="capabilities-heading">
        <h2 id="capabilities-heading">{t('capabilities.title')}</h2>
        <p>{t(`capabilities.notification.${capabilities.notification}`)}</p>
        <p>{t(`capabilities.mode.${capabilities.appMode}`)}</p>
        <p>{t(capabilities.serviceWorker ? 'capabilities.serviceWorkerAvailable' : 'capabilities.serviceWorkerUnavailable')}</p>
        <button type="button" onClick={requestPermission} disabled={capabilities.notification === 'granted' || capabilities.notification === 'unsupported'}>{t('capabilities.request')}</button>
        <p className="estimate-note">{t('capabilities.disclosure')}</p>
      </section>

      <section className="notice-card" aria-labelledby="speech-heading">
        <h2 id="speech-heading">{t('speech.title')}</h2>
        <p>{t(capabilities.speech ? 'speech.available' : 'speech.unavailable')}</p>
        <label><input type="checkbox" checked={speechSettings.enabled} disabled={!capabilities.speech} onChange={(event) => updateSpeech('enabled', event.target.checked)} />{t('speech.enable')}</label>
        <label><input type="checkbox" checked={speechSettings.includeSensitiveText} disabled={!speechSettings.enabled || !capabilities.speech} onChange={(event) => updateSpeech('includeSensitiveText', event.target.checked)} />{t('speech.includeSensitive')}</label>
        <button type="button" disabled={!speechSettings.enabled || !capabilities.speech} onClick={previewSpeech}>{t('speech.preview')}</button>
        <p className="estimate-note">{t('speech.limits')}</p>
      </section>

      <section className="notice-card" aria-labelledby="battery-heading">
        <h2 id="battery-heading">{t('battery.title')}</h2>
        <p>{t('battery.body')}</p>
        <label><input type="checkbox" checked={batteryState.enabled} onChange={(event) => activateBattery(event.target.checked)} />{t('battery.enable')}</label>
        <div className="notice-battery-grid">
          <div>
            <strong>{t('battery.latest')}</strong>
            <p>{batteryRecommendation.latest ? t('battery.percentLine', { percent: batteryRecommendation.latest.percent, source: t(`battery.source.${batteryRecommendation.latest.source}`) }) : t('battery.noData')}</p>
          </div>
          <div>
            <strong>{t('battery.average')}</strong>
            <p>{batteryRecommendation.enoughData ? t('battery.averageValue', { value: batteryRecommendation.averageDrainPerHour.toFixed(1) }) : t('battery.averageLearning', { count: batteryRecommendation.sampleCount })}</p>
          </div>
          <div>
            <strong>{t('battery.today')}</strong>
            <p>{batteryRecommendation.todayConsumption === null ? t('battery.todayEmpty') : t('battery.todayValue', { value: batteryRecommendation.todayConsumption })}</p>
          </div>
        </div>
        <p className="notice-confirmation" role="status">{t(`battery.recommendation.${batteryRecommendation.messageKey}`, { percent: batteryRecommendation.reminderPercent || 35 })}</p>
        <div className="notice-form-grid">
          <label>{t('battery.manualPercent')}<input min="0" max="100" type="number" value={batteryState.manualPercent} onChange={(event) => setBatteryState((current) => ({ ...current, manualPercent: event.target.value }))} /></label>
          <label>{t('battery.targetReadyAt')}<input type="time" value={batteryState.targetReadyAt} onChange={(event) => updateBattery({ ...batteryState, targetReadyAt: event.target.value })} /></label>
          <label>{t('battery.safetyMargin')}<input max="6" min="0" step="0.5" type="number" value={batteryState.safetyMarginHours} onChange={(event) => updateBattery({ ...batteryState, safetyMarginHours: event.target.value })} /></label>
        </div>
        <label><input type="checkbox" checked={batteryState.schoolMode} onChange={(event) => updateBattery({ ...batteryState, schoolMode: event.target.checked })} />{t('battery.schoolMode')}</label>
        <div className="notice-actions">
          <button type="button" onClick={saveManualBattery} disabled={!batteryState.enabled}>{t('battery.saveManual')}</button>
          <button type="button" onClick={readBatteryApi} disabled={!batteryState.enabled || !batteryCapabilities.batteryApi}>{t('battery.readApi')}</button>
          <button type="button" onClick={prepareBatteryReminder}>{t('battery.createReminder')}</button>
        </div>
        <p className="estimate-note">{t(batteryCapabilities.batteryApi ? 'battery.limits.api' : 'battery.limits.manual')}</p>
        <p className="estimate-note">{t('battery.limits.background')}</p>
      </section>

      <section className="notice-card" aria-labelledby="memory-heading">
        <h2 id="memory-heading">{t('memory.title')}</h2>
        <div className="notice-techniques">{['associate', 'image', 'walk', 'repeat', 'steps', 'location', 'say', 'checklist'].map((id) => <article key={id}><button aria-expanded={technique === id} type="button" onClick={() => setTechnique(technique === id ? '' : id)}>{t(`memory.techniques.${id}.title`)}</button>{technique === id && <div><p>{t(`memory.techniques.${id}.body`)}</p><p>{t(`memory.techniques.${id}.example`)}</p><button type="button" onClick={() => prepareMemoryReminder(id)}>{t('memory.createReminder')}</button><button type="button" onClick={() => setTechnique('')}>{t('memory.back')}</button></div>}</article>)}</div>
        <p className="estimate-note">{t('memory.locationSoon')}</p>
      </section>
      <p className="notice-privacy">{t('privacy')}</p>
    </section>
  )
}

export default NoticeHub
