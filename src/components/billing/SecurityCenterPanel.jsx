import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient.js'

const LABELS = {
  AUTH_FAILURE_BURST: 'Upprepade inloggningsfel',
  QUOTA_BYPASS_ATTEMPT: 'Misstänkt kvotförsök',
  PREMIUM_ACCESS_DENIED: 'Premiumåtkomst nekad',
  BILLING_TAMPER_ATTEMPT: 'Misstänkt betalningsmanipulation',
  CROSS_USER_ACCESS_DENIED: 'Åtkomst till annat konto nekad',
  AI_USAGE_SPIKE: 'Ovanligt hög AI-användning',
  API_RATE_LIMITED: 'Anropsgräns uppnådd',
  MONITORING_UNAVAILABLE: 'Övervakningen otillgänglig',
  ADMIN_ACCESS_DENIED: 'Obehörigt försök till adminfunktion',
  QUOTA_EXCEEDED: 'Kvot överskriden',
}

async function currentAccessToken() {
  if (!supabase) throw new Error('session unavailable')
  const { data, error } = await supabase.auth.getSession()
  const accessToken = data?.session?.access_token
  if (error || !accessToken) throw new Error('session unavailable')
  return accessToken
}

export default function SecurityCenterPanel({ token }) {
  const [events, setEvents] = useState([])
  const [state, setState] = useState('loading')
  const [updated, setUpdated] = useState('')

  useEffect(() => {
    if (!token) return undefined
    let active = true
    async function refresh() {
      try {
        // Read the current Supabase session for every poll; never reuse an
        // access token captured when the admin panel was first opened.
        const accessToken = await currentAccessToken()
        const response = await fetch('/api/security-center', {
          headers: { Authorization: 'Bearer ' + accessToken },
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('unavailable')
        const payload = await response.json()
        if (!payload.ok || !Array.isArray(payload.events)) throw new Error('unavailable')
        if (!active) return
        setEvents(payload.events)
        setUpdated(new Date().toLocaleTimeString('sv-SE'))
        setState('ready')
      } catch {
        if (active) setState('unavailable')
      }
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, 5000)
    return () => { active = false; clearInterval(timer) }
  }, [token])

  return (
    <section aria-label="Säkerhetscentral">
      <h3>Säkerhetscentral</h3>
      <p>Serverhändelser, uppdateras var femte sekund när sidan är öppen.</p>
      {state === 'loading' && <p>Hämtar säkerhetshändelser…</p>}
      {state === 'unavailable' && <p role="alert">Säkerhetsövervakningen kan inte läsas. Kontrollera databas och logginsamling.</p>}
      {state === 'ready' && (
        <>
          <p>Senast hämtad: {updated}. {events.length} senaste händelser.</p>
          {events.length === 0 ? <p>Inga registrerade händelser. Detta bekräftar inte att alla säkerhetskontroller är aktiva.</p> : (
            <ul>
              {events.map((event, index) => (
                <li key={event.id || index}>
                  <strong>{LABELS[event.type] || 'Säkerhetshändelse'}</strong>
                  {' · '}{event.severity || 'okänd nivå'}
                  {' · '}{event.feature || 'okänd funktion'}
                  {' · '}{event.last_seen_at || event.occurred_at || event.timestamp || 'okänd tid'}
                  {Number(event.event_count) > 1 ? ` · ${Number(event.event_count)} gånger` : ''}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
