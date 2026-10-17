import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { normalizeLanguageCode, getLanguageDefinition } from '../../i18n/languages.js'
import { requestSupport } from './supportClient.js'
import { supportChrome } from './supportChrome.js'

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

export default function SupportPanel({ admin = false }) {
  const { i18n } = useTranslation()
  const language = normalizeLanguageCode(i18n.resolvedLanguage || i18n.language)
  const chrome = supportChrome(language)
  const [opened, setOpened] = useState(admin)
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState('technical')
  const requestId = useRef(null)
  const seen = useRef(new Set())
  const active = useRef(true)
  const inFlight = useRef(false)
  const chromeRef = useRef(chrome)
  useEffect(() => { chromeRef.current = chrome }, [chrome])
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const result = await requestSupport({ admin })
      if (!active.current) return
      if (!result.ok) { setData(null); setNotice(chromeRef.current.error); return }
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
    } finally { inFlight.current = false }
  }, [admin])
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

  return <section className="app-information support-panel" aria-label={admin ? chrome.adminTitle : chrome.title} dir={getLanguageDefinition(language).direction} lang={language}>
    <h3>{admin ? chrome.adminTitle : chrome.title}</h3>
    <p>{chrome.policy}</p>
    {!opened && <button type="button" className="secondary-button" onClick={() => setOpened(true)}>{chrome.check}</button>}
    {opened && <>
      <p>{chrome.notice}</p>
      <button type="button" className="secondary-button" onClick={() => { void load() }} disabled={busy}>{chrome.refresh}</button>
      {admin && <>
        <p role="status">{chrome.pending}: {data?.pendingCount ?? '—'}</p>
        <button className="secondary-button" type="button" onClick={async () => {
          try {
            const permission = await window.Notification?.requestPermission()
            setNotice(permission === 'granted' ? chrome.notificationsEnabled : chrome.notificationsDenied)
          } catch { setNotice(chrome.notificationsDenied) }
        }}>{chrome.enableNotifications}</button>
      </>}
      {notice && <p role="status">{notice}</p>}
      {!admin && data?.eligible === true && <form onSubmit={async (event) => {
        event.preventDefault()
        requestId.current ||= crypto.randomUUID()
        if (await command({ action: 'create', requestId: requestId.current, category, message })) { setMessage(''); requestId.current = null }
      }}>
        <label>{chrome.title}<select disabled={busy} value={category} onChange={(e) => { setCategory(e.target.value); requestId.current = null }}>{['billing','technical','account','other'].map((value) => <option key={value} value={value}>{chrome[value]}</option>)}</select></label>
        <label>{chrome.message}<textarea disabled={busy} value={message} maxLength={2000} placeholder={chrome.placeholder} onChange={(e) => { setMessage(e.target.value); requestId.current = null }} /></label>
        <button className="secondary-button" disabled={busy || !message.trim()}>{chrome.create}</button>
      </form>}
      {data?.tickets?.length === 0 && <p>{chrome.empty}</p>}
      {(data?.tickets || []).map((ticket) => <Ticket key={`${ticket.id}:${ticket.version}`} ticket={ticket} admin={admin} chrome={chrome} busy={busy} eligible={data?.eligible === true} onCommand={command} />)}
    </>}
  </section>
}
