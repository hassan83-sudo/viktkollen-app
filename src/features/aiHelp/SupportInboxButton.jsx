import { useEffect, useState } from 'react'
import { requestSupport } from './supportClient.js'

export function supportReadKey(userId, ticketId) {
  return 'viktkollen.support.read.' + userId + '.' + ticketId
}
export function supportReplyCount(ticket) {
  return (ticket.thread || []).filter(item => item.role === 'support').length
}
export function markSupportRead(userId, ticket) {
  try { localStorage.setItem(supportReadKey(userId, ticket.id), String(supportReplyCount(ticket))) } catch { return }
  window.dispatchEvent(new Event('viktkollen:support-read'))
}
export default function SupportInboxButton({ userId, onOpen }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!userId) return
    let active = true
    let tickets = []
    function recount() {
      if (!active) return
      setCount(tickets.reduce((sum, ticket) => {
        let read = 0
        try { read = Number(localStorage.getItem(supportReadKey(userId, ticket.id))) || 0 } catch {}
        return sum + Math.max(0, supportReplyCount(ticket) - read)
      }, 0))
    }
    async function refresh() {
      const result = await requestSupport()
      if (!active) return
      tickets = result.ok ? result.tickets || [] : []
      recount()
    }
    void refresh()
    const timer = setInterval(refresh, 30000)
    window.addEventListener('viktkollen:support-read', recount)
    return () => { active = false; clearInterval(timer); window.removeEventListener('viktkollen:support-read', recount) }
  }, [userId])
  if (!userId) return null
  return <button type="button" className="secondary-button" aria-label={'Supportmeddelanden, ' + count + ' olästa'} onClick={onOpen} style={{position:'relative',display:'inline-flex',alignItems:'center',gap:6}}>
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
    {count > 0 && <span style={{background:'#b91c1c',color:'white',borderRadius:20,padding:'2px 6px',fontSize:12}}>{count}</span>}
  </button>
}
