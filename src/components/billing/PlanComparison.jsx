import { Component, useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient.js'
import CheckoutReturnStatus from './CheckoutReturnStatus.jsx'
import { readReturnedCheckoutId } from '../../services/billing/checkoutReturn.js'
import './PlanComparison.css'

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

const QUOTA_KEYS = Object.freeze(['ai_coach', 'food_scan', 'body_scan', 'ai_eye'])

const CHECKOUT_ERRORS = Object.freeze({
  ACTIVE_PERIOD_EXISTS: 'Du har redan en aktiv period. Ett nytt köp kan göras när den har tagit slut.',
  CHECKOUT_IN_PROGRESS: 'Du har en påbörjad betalning för en annan plan. Slutför den eller vänta en halvtimme tills den har gått ut.',
  PROVIDER_NOT_CONFIGURED: 'Betalning är inte tillgänglig just nu.',
})

function formatSwedishCount(value) {
  return new Intl.NumberFormat('sv-SE', {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(value).replace(/[\u00a0\u202f]/g, ' ')
}

function presentPlan(plan) {
  if (!plan || typeof plan.priceText !== 'string' || typeof plan.name !== 'string') return null
  const quotas = Array.isArray(plan.quotas)
    ? plan.quotas.map((row) => {
      const label = LABELS[row?.key]
      const limit = Number(row?.limit)
      if (!label || !QUOTA_KEYS.includes(row?.key) || !Number.isInteger(limit) || limit < 0) return null
      return { key: row.key, label, limit }
    })
    : []
  const complete = plan.complete === true && quotas.filter(Boolean).length === QUOTA_KEYS.length
  const unlimited = Array.isArray(plan.unlimited)
    ? plan.unlimited.map((row) => LABELS[row?.key]).filter(Boolean)
    : []
  const availability = plan.current === true
    ? 'Din plan'
    : plan.forSale === true || plan.complimentary === true
      ? 'Tillgänglig'
      : 'Kommer snart'
  return {
    availability,
    complete,
    current: plan.current === true,
    name: plan.name,
    forSale: plan.forSale === true,
    offerKey: typeof plan.offerKey === 'string' ? plan.offerKey : '',
    priceText: plan.priceText,
    quotas: complete ? quotas.filter(Boolean) : [],
    unlimited: complete ? unlimited : [],
  }
}

function PlanComparison({ authLoading = false, isAuthenticated = false }) {
  const authKey = authLoading ? 'loading' : isAuthenticated ? 'in' : 'out'
  const [remote, setRemote] = useState({ authKey, comparison: null, status: 'idle' })
  const [checkout, setCheckout] = useState({ pending: null, error: '' })
  const [returnedCheckoutId] = useState(() => readReturnedCheckoutId())
  const [reloadKey, setReloadKey] = useState(0)

  async function buyOnce(offerKey) {
    if (!supabase || checkout.pending) return
    setCheckout({ pending: offerKey, error: '' })
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (!token) throw new Error('Logga in för att betala.')
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_key: offerKey, payment_mode: 'one_time' }),
      })
      const payload = await response.json().catch(() => null)
      const known = CHECKOUT_ERRORS[payload?.error?.code]
      if (response.status !== 202 && known) throw new Error(known)
      if (response.status !== 202 || !payload?.hostedCheckoutUrl) throw new Error('Betalningen kunde inte startas.')
      const url = new URL(payload.hostedCheckoutUrl)
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.sumup.com') throw new Error('Ogiltig betalningslänk.')
      window.location.assign(url.href)
    } catch (error) {
      setCheckout({ pending: null, error: error.message || 'Betalningen kunde inte startas.' })
    }
  }
  if (remote.authKey !== authKey) {
    setRemote({ authKey, comparison: null, status: 'idle' })
  }

  useEffect(() => {
    if (authLoading || !isAuthenticated) return undefined
    let cancelled = false
    async function load() {
      if (!supabase) {
        if (!cancelled) setRemote({ authKey: 'in', comparison: null, status: 'unavailable' })
        return
      }
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token || ''
      if (!token) {
        if (!cancelled) setRemote({ authKey: 'in', comparison: null, status: 'signed-out' })
        return
      }
      const response = await fetch('/api/billing/plans', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json().catch(() => null)
      if (cancelled) return
      const plans = payload?.comparison?.plans
      if (!response.ok || payload?.ok !== true || !Array.isArray(plans) || plans.length === 0) {
        setRemote({
          authKey: 'in',
          comparison: null,
          status: response.status === 401 ? 'signed-out' : 'unavailable',
        })
        return
      }
      setRemote({ authKey: 'in', comparison: payload.comparison, status: 'ready' })
    }
    load().catch(() => {
      if (!cancelled) setRemote({ authKey: 'in', comparison: null, status: 'unavailable' })
    })
    return () => {
      cancelled = true
    }
  }, [authLoading, isAuthenticated, reloadKey])

  const comparison = remote.authKey === authKey ? remote.comparison : null
  const state = authLoading
    ? 'loading'
    : !isAuthenticated
      ? 'signed-out'
      : remote.authKey === authKey && remote.status !== 'idle'
        ? remote.status
        : 'loading'
  const plans = Array.isArray(comparison?.plans)
    ? comparison.plans.map(presentPlan).filter(Boolean)
    : []
  const unlimited = []
  for (const plan of plans) {
    for (const label of plan.unlimited) {
      if (!unlimited.includes(label)) unlimited.push(label)
    }
  }

  return (
    <section className="app-information plan-compare" aria-labelledby="plan-compare-title">
      {returnedCheckoutId && isAuthenticated ? (
        <CheckoutReturnStatus checkoutId={returnedCheckoutId} onPaid={() => setReloadKey((value) => value + 1)} />
      ) : null}
      <details>
        <summary id="plan-compare-title">Jämför abonnemang</summary>
        {state === 'loading' ? <p role="status">Hämtar abonnemang…</p> : null}
        {state === 'signed-out' ? <p>Logga in för att jämföra abonnemang.</p> : null}
        {state === 'unavailable' ? <p role="status">Jämförelsen kunde inte hämtas just nu.</p> : null}
        {state === 'ready' && plans.length ? (
          <>
            <ul className="plan-compare-list">
              {plans.map((plan) => {
                const quotaText = plan.quotas.map((row) => `${row.label} ${formatSwedishCount(row.limit)}`).join(', ')
                return (
                  <li
                    className="plan-compare-card"
                    key={plan.priceText}
                    aria-label={`${plan.priceText}, ${plan.availability}${quotaText ? `, ${quotaText}` : ''}`}
                  >
                    <p className="plan-compare-price">{plan.priceText}</p>
                    <p className="plan-compare-state">{plan.availability}</p>
                    {plan.forSale && !plan.current && plan.offerKey ? (
                      <button type="button" disabled={checkout.pending !== null} onClick={() => buyOnce(plan.offerKey)}>
                        {checkout.pending === plan.offerKey ? 'Öppnar SumUp…' : 'Betala en gång – 30 dagar, ingen förnyelse'}
                      </button>
                    ) : null}
                    {plan.complete ? (
                      <ul className="plan-compare-quotas">
                        {plan.quotas.map((row) => (
                          <li key={row.key}>
                            <span>{row.label}</span>
                            <span>{formatSwedishCount(row.limit)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>Kvoten kunde inte visas.</p>
                    )}
                  </li>
                )
              })}
            </ul>
            {checkout.error ? <p role="alert">{checkout.error}</p> : null}
            {unlimited.length ? (
              <>
                <h4>Ingår utan användningsgräns</h4>
                <p>Obegränsat</p>
                <ul className="plan-compare-unlimited" aria-label={unlimited.map((label) => `${label}: obegränsat`).join(', ')}>
                  {unlimited.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
                <p className="plan-compare-note">Normal användning. Tekniska säkerhetsgränser gäller.</p>
              </>
            ) : null}
          </>
        ) : null}
      </details>
    </section>
  )
}

class PlanComparisonErrorBoundary extends Component {
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
        <section className="app-information plan-compare" aria-labelledby="plan-compare-title">
          <h3 id="plan-compare-title">Jämför abonnemang</h3>
          <p role="status">Jämförelsen kunde inte hämtas just nu.</p>
        </section>
      )
    }
    return this.props.children
  }
}

export default function PlanComparisonBoundary(props) {
  return (
    <PlanComparisonErrorBoundary>
      <PlanComparison {...props} />
    </PlanComparisonErrorBoundary>
  )
}
