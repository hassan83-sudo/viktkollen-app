import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient.js'

const PAID_PLAN_COUNT = 14
const PROBE_CODES = new Set([
  'AUTH_REQUIRED',
  'FORBIDDEN',
  'SERVICE_ROLE_UNAVAILABLE',
  'SCHEMA_NOT_EXPOSED',
  'PERMISSION_DENIED',
  'POSTGREST_ERROR',
])

function probeNotice(payload) {
  if (payload?.ok === true && payload?.billingPostgrestReachable === true) {
    return 'PostgREST billing: OK'
  }
  const code = payload?.code || payload?.error?.code
  return `PostgREST billing: ${PROBE_CODES.has(code) ? code : 'POSTGREST_ERROR'}`
}

async function adminFetch(token, path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  return { payload, response }
}

const QUOTA_LABELS = Object.freeze([
  ['ai_coach', 'AI-coach'],
  ['food_scan', 'Matscanning'],
  ['body_scan', 'Kroppsscanning'],
  ['ai_eye', 'AI-Ögat'],
])

function PostgrestProbe({ onRun, result }) {
  return (
    <div>
      {/* Temporary BILL-5B3E diagnostic. Remove with /api/billing/postgrest-probe after HIGH #1 is verified. */}
      <button type="button" onClick={onRun}>Testa PostgREST</button>
      {result ? <p role="status">{result}</p> : null}
    </div>
  )
}

function formatCount(value) {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0, useGrouping: true })
    .format(value)
    .replace(/[\u00a0\u202f]/g, ' ')
}

function validPlans(payload) {
  return payload?.ok === true
    && Array.isArray(payload.plans)
    && payload.plans.length === PAID_PLAN_COUNT
    && payload.plans.every((plan) => QUOTA_LABELS.every(([key]) => Number.isInteger(plan.quotas?.[key]) && plan.quotas[key] >= 0))
}

export default function PlanCommercialAdmin() {
  const [notice, setNotice] = useState('')
  const [probeResult, setProbeResult] = useState('')
  const [pendingId, setPendingId] = useState('')
  const [plans, setPlans] = useState([])
  const [status, setStatus] = useState('checking')
  const [token, setToken] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!supabase) {
        if (!cancelled) setStatus('hidden')
        return
      }
      const { data } = await supabase.auth.getSession()
      const accessToken = data?.session?.access_token || ''
      if (!accessToken) {
        if (!cancelled) setStatus('hidden')
        return
      }
      const capability = await adminFetch(accessToken, '/api/billing/capability')
      if (!capability.response.ok || capability.payload?.billing_admin !== true) {
        if (!cancelled) setStatus('hidden')
        return
      }
      const session = await adminFetch(accessToken, '/api/billing/admin')
      if (!session.response.ok) {
        if (!cancelled) setStatus('hidden')
        return
      }
      const listed = await adminFetch(accessToken, '/api/billing/admin?resource=plan_commercial')
      if (cancelled) return
      if (!listed.response.ok || !validPlans(listed.payload)) {
        setPlans([])
        setStatus('error')
        setToken(accessToken)
        return
      }
      setToken(accessToken)
      setPlans(listed.payload.plans)
      setStatus('ready')
    }
    load().catch(() => {
      if (!cancelled) setStatus('hidden')
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function runPostgrestProbe() {
    setProbeResult('')
    try {
      const { payload } = await adminFetch(token, '/api/billing/postgrest-probe', { method: 'POST' })
      setProbeResult(probeNotice(payload))
    } catch {
      setProbeResult('PostgREST billing: POSTGREST_ERROR')
    }
  }

  async function persist(plan, body) {
    setNotice('')
    setPendingId(plan.plan_id)
    try {
      const { payload, response } = await adminFetch(token, '/api/billing/admin', {
        body: JSON.stringify(body),
        method: 'POST',
      })
      if (!response.ok || !validPlans(payload)) {
        setNotice('Ändringen sparades inte.')
        return
      }
      setPlans(payload.plans)
    } catch {
      setNotice('Ändringen sparades inte.')
    } finally {
      setPendingId('')
    }
  }

  if (status === 'checking' || status === 'hidden') return null
  if (status === 'error') {
    return (
      <section className="app-information" aria-labelledby="plan-commercial-admin-title">
        <h3 id="plan-commercial-admin-title">Planer</h3>
        <p role="alert">Planstatus kunde inte läsas. Inga planer visas som tillgängliga.</p>
        <PostgrestProbe onRun={runPostgrestProbe} result={probeResult} />
      </section>
    )
  }

  return (
    <section className="app-information" aria-labelledby="plan-commercial-admin-title">
      <h3 id="plan-commercial-admin-title">Planer</h3>
      <p>Betalning är inte ansluten ännu.</p>
      <p>Att markera en plan som tillgänglig aktiverar inte köp eller checkout.</p>
      <p>PRELIMINARY / NOT FINALIZED</p>
      {notice ? <p role="alert">{notice}</p> : null}
      <PostgrestProbe onRun={runPostgrestProbe} result={probeResult} />
      <ul>
        {plans.map((plan, index) => {
          const price = `${plan.price_sek_minor / 100} kr`
          const busy = pendingId === plan.plan_id
          return (
            <li key={plan.plan_id}>
              <span>{price}</span>
              {' '}
              <span>{`Ordning ${plan.display_order}`}</span>
              {' '}
              <span>{plan.enabled_for_sale ? 'ON' : 'OFF'}</span>
              {' '}
              <span>PRELIMINARY / NOT FINALIZED</span>
              <ul>
                {QUOTA_LABELS.map(([key, label]) => (
                  <li key={key}>{`${label} ${formatCount(plan.quotas[key])}`}</li>
                ))}
              </ul>
              <div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => persist(plan, {
                    action: 'set_plan_availability',
                    enabled_for_sale: plan.enabled_for_sale !== true,
                    expected_version: plan.version,
                    plan_id: plan.plan_id,
                  })}
                >
                  {plan.enabled_for_sale ? `Inaktivera ${price}` : `Aktivera ${price}`}
                </button>
                <button
                  type="button"
                  disabled={busy || index === 0}
                  onClick={() => persist(plan, {
                    action: 'move_plan_display_order',
                    direction: 'up',
                    expected_version: plan.version,
                    plan_id: plan.plan_id,
                  })}
                >
                  {`Flytta upp ${price}`}
                </button>
                <button
                  type="button"
                  disabled={busy || index === plans.length - 1}
                  onClick={() => persist(plan, {
                    action: 'move_plan_display_order',
                    direction: 'down',
                    expected_version: plan.version,
                    plan_id: plan.plan_id,
                  })}
                >
                  {`Flytta ned ${price}`}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
