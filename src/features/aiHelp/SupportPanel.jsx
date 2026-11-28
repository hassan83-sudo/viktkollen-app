import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { normalizeLanguageCode, getLanguageDefinition } from '../../i18n/languages.js'
import { requestSupport } from './supportClient.js'
import { markSupportRead } from './SupportInboxButton.jsx'
import { supportChrome } from './supportChrome.js'

const supportHours = {
  "sv": [
    "Kundtjänst – alla dagar i veckan",
    "Vi finns vanligtvis tillgängliga mellan kl. 09.00 och 22.00.",
    "Vi försöker svara inom 30 minuter, men ibland kan det ta upp till 24 timmar."
  ],
  "en": [
    "Customer service – every day",
    "We are usually available from 09:00 to 22:00.",
    "We aim to reply within 30 minutes, but it may take up to 24 hours."
  ],
  "es": [
    "Atención al cliente – todos los días",
    "Normalmente estamos disponibles de 09:00 a 22:00.",
    "Intentamos responder en 30 minutos, pero podemos tardar hasta 24 horas."
  ],
  "ar": [
    "خدمة العملاء – كل أيام الأسبوع",
    "نتوفر عادةً من الساعة 09:00 إلى 22:00.",
    "نحاول الرد خلال 30 دقيقة، وقد يستغرق الرد حتى 24 ساعة."
  ],
  "zh-CN": [
    "客户服务 – 每天开放",
    "我们通常每天09:00至22:00提供服务。",
    "我们尽量在30分钟内回复，但最长可能需要24小时。"
  ]
}

function Ticket({ ticket, admin, chrome, onCommand, busy, eligible }) {
  const [reply, setReply] = useState('')
  const [priority, setPriority] = useState(ticket.priority)
  const [status, setStatus] = useState(ticket.status)
  return <article className="app-information" aria-label={`${chrome.title} ${ticket.id}`}>
    <h4>{chrome[ticket.category]} · {chrome[ticket.status]} · {chrome[ticket.priority]}</h4>
    <small>{ticket.id} · {ticket.created_at}</small>
    {ticket.thread.map((item, index) => <p key={index}><strong>{chrome[item.role]}:</strong> {item.message}</p>)}
    {admin && <form onSubmit={(event) => { event.preventDefault(); onCommand({ action: 'update', ticketId: ticket.id, version: ticket.version, priority, status }) }}>
      <label>{chrome.priority}<select value={priority} onChange={(e) => setPriority(e.target.value)}>{['high','normal','low'].map((value) => <option key={value} value={value}>{chrome[value]}</option>)}</select></label>
      <label>{chrome.status}<select value={status} onChange={(e) => setStatus(e.target.value)}>{['open','in_progress','answered','resolved'].map((value) => <option key={value} value={value}>{chrome[value]}</option>)}</select></label>
      <button className="secondary-button" disabled={busy}>{chrome.save}</button>
    </form>}
    {(admin || eligible) && <form onSubmit={async (event) => { event.preventDefault(); if (await onCommand({ action: 'reply', ticketId: ticket.id, version: ticket.version, message: reply })) setReply('') }}>
      <label>{chrome.message}<textarea value={reply} maxLength={2000} onChange={(e) => setReply(e.target.value)} placeholder={chrome.placeholder} /></label>
      <button className="secondary-button" disabled={busy || !reply.trim()}>{chrome.reply}</button>
    </form>}
  </article>
}

export default function SupportPanel({ admin = false, userId = null, initiallyOpened = false }) {
  const { i18n } = useTranslation()
  const language = normalizeLanguageCode(i18n.resolvedLanguage || i18n.language)
  const chrome = supportChrome(language)
  const hours = supportHours[language] || supportHours.en
  const [opened, setOpened] = useState(admin || initiallyOpened)
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState('technical')
  const [delayHours, setDelayHours] = useState(10)
  const [selectedTickets, setSelectedTickets] = useState([])
  const [bulkAudience, setBulkAudience] = useState('waiting')
  const requestId = useRef(null)
  const seen = useRef(new Set())
  const active = useRef(true)
  const inFlight = useRef(false)
  const chromeRef = useRef(chrome)
  useEffect(() => { chromeRef.current = chrome }, [chrome])
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    const openSupport = () => setOpened(true)
    window.addEventListener('viktkollen:open-human-support', openSupport)
    return () => window.removeEventListener('viktkollen:open-human-support', openSupport)
  }, [])
  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const result = await requestSupport({ admin })
      if (!active.current) return
      if (!result.ok) { setData(null); setLoadFailed(true); return }
      if (admin) for (const ticket of result.tickets || []) {
        const key = `${ticket.id}:${ticket.version}`
        if (ticket.notification_pending && !seen.current.has(key)) {
          try {
            if (typeof window !== 'undefined' && window.Notification?.permission === 'granted') {
              new window.Notification(chromeRef.current.pending, {
                body: chromeRef.current.adminTitle,
                tag: `viktkollen-support-${ticket.id}`,
              })
              seen.current.add(key)
            }
          } catch { /* Keep the pending count visible when notifications are unavailable. */ }
        }
      }
      setData(result)
      if (!admin && userId) for (const ticket of result.tickets || []) markSupportRead(userId, ticket)
      setLoadFailed(false)
    } finally { inFlight.current = false }
  }, [admin, userId])
  useEffect(() => {
    if (!opened) return undefined
    // Start asynchronously; cleanup prevents a private reply reaching an unmounted/account-switched panel.
    const initial = setTimeout(() => { void load() }, 0)
    const timer = setInterval(() => { void load() }, 30000)
    return () => { clearTimeout(initial); clearInterval(timer) }
  }, [opened, load])

  async function command(body) {
    if (busy || inFlight.current) return false
    setBusy(true); setNotice('')
    try {
      const result = await requestSupport({ admin, command: body })
      if (!active.current) return false
      if (!result.ok) {
        setNotice(result.code === 'CONFLICT' ? chrome.conflict : result.code === 'RATE_LIMITED' ? chrome.limited : result.code === 'PAID_SUPPORT_REQUIRED' ? chrome.policy : chrome.error)
        await load()
        return false
      }
      setNotice(chrome.saved)
      await load()
      return true
    } finally { if (active.current) setBusy(false) }
  }

  async function sendBulkDelay() {
    if (busy || !window.confirm('Skicka fördröjningsmeddelandet till valda kunder?')) return
    const ticketIds = bulkAudience === 'selected' ? selectedTickets : null
    if (bulkAudience === 'selected' && !ticketIds.length) { setNotice('Välj minst ett ärende.'); return }
    setBusy(true)
    try {
      const result = await requestSupport({ admin: true, command: { action: 'bulk_delay', hours: delayHours, ticketIds } })
      setNotice(result.ok ? `Meddelandet skickades till ${result.sentCount} ärenden.` : 'Utskicket misslyckades. Inga bekräftade utskick.')
      if (result.ok) { setSelectedTickets([]); await load() }
    } finally { setBusy(false) }
  }

  return <section className="app-information support-panel" aria-label={admin ? chrome.adminTitle : chrome.title} dir={getLanguageDefinition(language).direction} lang={language}>
    <h3>{admin ? chrome.adminTitle : chrome.title}</h3>
    {!admin && <><p><strong>{hours[0]}</strong></p><p>{hours[1]}</p><p>{hours[2]}</p></>}
    <p>{chrome.policy}</p>
    {!opened && <button type="button" className="secondary-button" onClick={() => setOpened(true)}>{chrome.check}</button>}
    {opened && <>
      <p>{chrome.notice}</p>
      <button type="button" className="secondary-button" onClick={() => { void load() }} disabled={busy}>{chrome.refresh}</button>
      {admin && <>
        <div className="app-information" aria-label="Massmeddelande om svarstid">
          <h4>Massmeddelande om längre svarstid</h4>
          <label>Beräknad svarstid: {delayHours} {delayHours === 1 ? 'timme' : 'timmar'}
            <input type="range" min="1" max="24" step="1" value={delayHours} onChange={event => setDelayHours(Number(event.target.value))} />
          </label>
          <label>Mottagare <select value={bulkAudience} onChange={event => setBulkAudience(event.target.value)}><option value="waiting">Alla väntande ärenden</option><option value="selected">Markerade ärenden</option></select></label>
          {bulkAudience === 'selected' && (data?.tickets || []).filter(ticket => ['open','in_progress'].includes(ticket.status)).map(ticket => <label key={ticket.id}><input type="checkbox" checked={selectedTickets.includes(ticket.id)} onChange={event => setSelectedTickets(current => event.target.checked ? [...current,ticket.id] : current.filter(id => id !== ticket.id))} /> {ticket.category} · {ticket.id}</label>)}
          <p>Vi har för närvarande många supportärenden. Det kan därför dröja upp till {delayHours} {delayHours === 1 ? 'timme' : 'timmar'} innan du får svar. Tack för ditt tålamod!</p>
          <button type="button" className="secondary-button" disabled={busy || !data || (bulkAudience === 'selected' && !selectedTickets.length)} onClick={() => void sendBulkDelay()}>Skicka till valda kunder</button>
        </div>
        <p role="status">{chrome.pending}: {data?.pendingCount ?? '—'}</p>
        <button className="secondary-button" type="button" onClick={async () => {
          try {
            const permission = await window.Notification?.requestPermission()
            setNotice(permission === 'granted' ? chrome.notificationsEnabled : chrome.notificationsDenied)
          } catch { setNotice(chrome.notificationsDenied) }
        }}>{chrome.enableNotifications}</button>
      </>}
      {(loadFailed || notice) && <p role="status">{loadFailed ? chrome.error : notice}</p>}
      {!admin && data && <form onSubmit={async (event) => {
        event.preventDefault()
        requestId.current ||= crypto.randomUUID()
        if (await command({ action: 'create', requestId: requestId.current, category: data.eligible ? category : 'billing', message })) { setMessage(''); requestId.current = null }
      }}>
        <label>{chrome.title}<select disabled={busy} value={data.eligible ? category : 'billing'} onChange={(e) => { setCategory(e.target.value); requestId.current = null }}>{(data.eligible ? ['billing','technical','account','other'] : ['billing']).map((value) => <option key={value} value={value}>{chrome[value]}</option>)}</select></label>
        <label>{chrome.message}<textarea disabled={busy} value={message} maxLength={2000} placeholder={chrome.placeholder} onChange={(e) => { setMessage(e.target.value); requestId.current = null }} /></label>
        <button className="secondary-button" disabled={busy || !message.trim()}>{chrome.create}</button>
      </form>}
      {data?.tickets?.length === 0 && <p>{chrome.empty}</p>}
      {(data?.tickets || []).map((ticket) => <Ticket key={`${ticket.id}:${ticket.version}`} ticket={ticket} admin={admin} chrome={chrome} busy={busy} eligible={data?.eligible === true || ticket.category === 'billing'} onCommand={command} />)}
    </>}
  </section>
}
