import { Component, useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient.js'
import './PlanUsagePanel.css'

const LABELS = Object.freeze({
  ai_coach: 'AI-coach',
  ai_ear: 'AI-Örat',
  ai_eye: 'AI-Ögat',
  body_scan: 'Kroppsscanning',
  food_scan: 'Matscanning',
  friend_chat: 'Vänchatt',
  gps: 'GPS/platsdelning',
  gps_live: 'GPS Live',
  sos: 'SOS/trygghetsfunktioner',
  speech: 'Uppläsning',
  voice_input: 'Röstinmatning',
})

const MONTHS = Object.freeze([
  'januari',
  'februari',
  'mars',
  'april',
  'maj',
  'juni',
  'juli',
  'augusti',
  'september',
  'oktober',
  'november',
  'december',
])

function formatQuotaReset(periodEnd) {
  const date = new Date(periodEnd)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'numeric',
    timeZone: 'Europe/Stockholm',
  }).formatToParts(date)
  const day = Number(parts.find((part) => part.type === 'day')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  if (!day || !month || !MONTHS[month - 1]) return ''
  return `${day} ${MONTHS[month - 1]}`
}

function presentQuota(row) {
  const limit = Number(row?.limit)
  const used = Number(row?.used)
  if (!Number.isInteger(limit) || limit < 0 || !Number.isInteger(used)) return null
  const safeUsed = Math.max(0, used)
  const remaining = Number.isInteger(Number(row?.remaining))
    ? Math.max(0, Number(row.remaining))
    : Math.max(0, limit - safeUsed)
  return {
    key: row.key,
    label: LABELS[row.key],
    limit,
    remaining,
    used: safeUsed,
  }
}

function PlanUsagePanel({ authLoading = false, isAuthenticated = false }) {
  const authKey = authLoading ? 'loading' : isAuthenticated ? 'in' : 'out'
  const [remote, setRemote] = useState({ authKey, snapshot: null, status: 'idle' })
  if (remote.authKey !== authKey) {
    setRemote({ authKey, snapshot: null, status: 'idle' })
  }

  useEffect(() => {
    if (authLoading || !isAuthenticated) return undefined
    let cancelled = false
    async function load() {
      if (!supabase) {
        if (!cancelled) setRemote({ authKey: 'in', snapshot: null, status: 'unavailable' })
        return
      }
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token || ''
      if (!token) {
        if (!cancelled) setRemote({ authKey: 'in', snapshot: null, status: 'signed-out' })
        return
      }
      const response = await fetch('/api/billing/usage', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json().catch(() => null)
      if (cancelled) return
      if (!response.ok || payload?.ok !== true || !payload.snapshot?.plan) {
        setRemote({
          authKey: 'in',
          snapshot: null,
          status: response.status === 401 ? 'signed-out' : 'unavailable',
        })
        return
      }
      setRemote({ authKey: 'in', snapshot: payload.snapshot, status: 'ready' })
    }
    load().catch(() => {
      if (!cancelled) setRemote({ authKey: 'in', snapshot: null, status: 'unavailable' })
    })
    return () => {
      cancelled = true
    }
  }, [authLoading, isAuthenticated])

  const snapshot = remote.authKey === authKey ? remote.snapshot : null
  const state = authLoading
    ? 'loading'
    : !isAuthenticated
      ? 'signed-out'
      : remote.authKey === authKey && remote.status !== 'idle'
        ? remote.status
        : 'loading'

  const resetLabel = snapshot?.period?.end ? formatQuotaReset(snapshot.period.end) : ''
  const quotas = Array.isArray(snapshot?.quotas)
    ? snapshot.quotas.map(presentQuota).filter((row) => row?.label)
    : []
  const unlimited = Array.isArray(snapshot?.unlimited)
    ? snapshot.unlimited.map((row) => LABELS[row?.key]).filter(Boolean)
    : []

  return (
    <section className="app-information plan-usage" aria-labelledby="plan-usage-title">
      <h3 id="plan-usage-title">Abonnemang & användning</h3>
      {state === 'loading' ? <p role="status">Hämtar abonnemang…</p> : null}
      {state === 'signed-out' ? <p>Logga in för att se abonnemang och användning.</p> : null}
      {state === 'unavailable' ? <p role="status">Abonnemanget kunde inte hämtas just nu.</p> : null}
      {state === 'ready' && snapshot ? (
        <>
          <p aria-label={`Nuvarande plan ${snapshot.plan.name}, ${snapshot.plan.priceText}`}>
            {snapshot.plan.name}
          </p>
          <p>{snapshot.plan.priceText}</p>
          {resetLabel ? (
            <p aria-label={`Kvoten återställs ${resetLabel}`}>Återställs {resetLabel}</p>
          ) : null}
          {quotas.length ? (
            <ul className="plan-usage-list">
              {quotas.map((row) => (
                <li
                  className="plan-usage-quota"
                  key={row.key}
                  aria-label={`${row.label}: ${row.used} av ${row.limit} använda, ${row.remaining} kvar`}
                >
                  <strong>{row.label}</strong>
                  <span>{row.used} av {row.limit} använda</span>
                  <span>{row.remaining} kvar{row.remaining === 0 ? '. Kvoten är slut' : ''}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Ingen kvot kunde visas.</p>
          )}
          {unlimited.length ? (
            <>
              <h4>Ingår utan användningsgräns</h4>
              <p>Obegränsat</p>
              <ul className="plan-usage-unlimited" aria-label={unlimited.map((label) => `${label}: obegränsat`).join(', ')}>
                {unlimited.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
              <p className="plan-usage-note">Normal användning. Tekniska säkerhetsgränser gäller.</p>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

class PlanUsageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="app-information plan-usage" aria-labelledby="plan-usage-title">
          <h3 id="plan-usage-title">Abonnemang & användning</h3>
          <p role="status">Abonnemanget kunde inte hämtas just nu.</p>
        </section>
      )
    }
    return this.props.children
  }
}

export default function PlanUsagePanelBoundary(props) {
  return (
    <PlanUsageErrorBoundary>
      <PlanUsagePanel {...props} />
    </PlanUsageErrorBoundary>
  )
}
