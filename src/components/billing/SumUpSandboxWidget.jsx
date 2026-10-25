import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient.js'
import {
  SUMUP_PAYMENT_WIDGET_SCRIPT,
  sumUpWidgetMountConfig,
} from '../../services/billing/sumupWidgetMount.js'

const WIDGET_STATES = new Set(['sent', 'invalid', 'auth-screen', 'error', 'success', 'fail'])

async function defaultPrepare() {
  if (!supabase) return { ok: false, status: 503 }
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token || ''
  if (!token) return { ok: false, status: 401 }
  const response = await fetch('/api/billing/sumup-sandbox', {
    body: JSON.stringify({}),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  const payload = await response.json().catch(() => null)
  return { ok: response.ok && payload?.ok === true, payload, status: response.status }
}

async function verifySandboxCheckout(checkoutId) {
  if (!supabase) return { ok: false, code: 'AUTH_REQUIRED' }
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token || ''
  if (!token) return { ok: false, code: 'AUTH_REQUIRED' }
  const response = await fetch('/api/billing/sumup-sandbox', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'verify', checkoutId }),
  })
  const payload = await response.json().catch(() => null)
  return { ok: response.ok && payload?.ok === true, accessGranted: payload?.accessGranted === true, code: payload?.code, paymentStatus: payload?.paymentStatus }
}

export default function SumUpSandboxWidget({
  authLoading = false,
  isAuthenticated = false,
  mountWidget,
  prepare = defaultPrepare,
}) {
  const [phase, setPhase] = useState('idle')
  const [startRequested, setStartRequested] = useState(false)
  const [checkoutId, setCheckoutId] = useState('')
  const [widgetState, setWidgetState] = useState('')
  const [verification, setVerification] = useState('idle')
  const [prepareRequest, setPrepareRequest] = useState(null)

  useEffect(() => {
    if (authLoading || !isAuthenticated || !startRequested || prepareRequest) return
    // A single explicit start must not issue a second POST during effect re-runs.
    setPrepareRequest({ promise: Promise.resolve().then(() => prepare()) })
  }, [authLoading, isAuthenticated, startRequested, prepareRequest, prepare])

  useEffect(() => {
    if (!prepareRequest) return undefined
    let cancelled = false
    prepareRequest.promise.then((result) => {
      if (cancelled) return
      if (!result?.ok || result.payload?.accessGranted !== false || result.payload?.amount !== 4 || result.payload?.currency !== 'SEK') {
        setPhase(result?.status === 401 ? 'signed-out' : 'unavailable')
        return
      }
      if (!sumUpWidgetMountConfig({ checkoutId: result.payload.checkoutId })) {
        setPhase('unavailable')
        return
      }
      setCheckoutId(result.payload.checkoutId)
      setPhase('ready')
    }).catch(() => {
      if (!cancelled) setPhase('unavailable')
    })
    return () => {
      cancelled = true
    }
  }, [prepareRequest])

  useEffect(() => {
    const config = sumUpWidgetMountConfig({ checkoutId })
    if (!config || phase !== 'ready') return undefined
    let disposed = false
    let mounted = null
    const mount = (widget) => {
      if (disposed || typeof widget?.mount !== 'function') return
      mounted = widget.mount({
        ...config,
        onResponse(type) {
          if (WIDGET_STATES.has(type)) setWidgetState(type)
        },
      })
    }
    if (mountWidget) {
      mount({ mount: mountWidget })
      return () => {
        disposed = true
        mounted?.unmount?.()
      }
    }
    const script = document.createElement('script')
    script.async = true
    script.dataset.sumupWidget = '1'
    script.src = SUMUP_PAYMENT_WIDGET_SCRIPT
    script.onload = () => mount(window.SumUpCard)
    document.body.appendChild(script)
    return () => {
      disposed = true
      mounted?.unmount?.()
      script.remove()
    }
  }, [checkoutId, mountWidget, phase])

  useEffect(() => {
    if (!['success', 'fail', 'error'].includes(widgetState) || !checkoutId) return
    let cancelled = false
    setVerification('checking')
    verifySandboxCheckout(checkoutId).then((result) => {
      if (cancelled) return
      setVerification(result.ok && result.accessGranted
        ? 'activated'
        : result.ok && result.paymentStatus === 'pending'
          ? 'pending'
          : result.code === 'ATOMIC_ACTIVATION_REQUIRED'
          ? 'activation-required'
          : result.code === 'RECURRING_INSTRUMENT_MISSING'
            ? 'instrument-missing'
            : 'unverified')
    }).catch(() => {
      if (!cancelled) setVerification('unverified')
    })
    return () => { cancelled = true }
  }, [widgetState, checkoutId])

  if (!isAuthenticated) return null

  return (
    <article className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">SumUp sandbox</p>
          <h2>4 SEK recurring setup</h2>
        </div>
      </div>
      <p>Kortuppgifter skickas till SumUp. Den här sidan ger ingen betald åtkomst.</p>
      {!startRequested ? <button type="button" onClick={() => setStartRequested(true)}>Starta Sandbox-test (4 kr)</button> : null}
      {phase === 'unavailable' ? <p>Sandbox-kassan är inte tillgänglig.</p> : null}
      {phase === 'ready' ? <div id="sumup-card" /> : null}
      {['success', 'fail', 'error'].includes(widgetState) ? <p role="status">{verification === 'checking' ? 'Verifierar betalningen hos SumUp…' : verification === 'activated' ? 'Betalningen är verifierad och testabonnemanget har aktiverats i Staging.' : verification === 'pending' ? 'SumUp visar fortfarande väntande betalning. Inget abonnemang aktiverat.' : verification === 'activation-required' ? 'Betalningen är verifierad, men säker abonnemangsaktivering saknas ännu.' : verification === 'instrument-missing' ? 'SumUp saknar verifierad recurring-token. Inget abonnemang aktiverat.' : 'Kunde inte bekräfta betalningen hos servern. Kontrollera status innan ett nytt försök.'}</p> : null}
      {widgetState === 'auth-screen' ? <p>SumUp visar en verifiering.</p> : null}
    </article>
  )
}
