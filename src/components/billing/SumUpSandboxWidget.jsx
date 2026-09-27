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

export default function SumUpSandboxWidget({
  authLoading = false,
  isAuthenticated = false,
  mountWidget,
  prepare = defaultPrepare,
}) {
  const [phase, setPhase] = useState('idle')
  const [checkoutId, setCheckoutId] = useState('')
  const [widgetState, setWidgetState] = useState('')

  useEffect(() => {
    if (authLoading || !isAuthenticated) return undefined
    let cancelled = false
    prepare().then((result) => {
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
  }, [authLoading, isAuthenticated, prepare])

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
      {phase === 'unavailable' ? <p>Sandbox-kassan är inte tillgänglig.</p> : null}
      {phase === 'ready' ? <div id="sumup-card" /> : null}
      {widgetState === 'success' ? <p>SumUp tog emot kortet. Servern måste verifiera innan något ändras.</p> : null}
      {widgetState === 'auth-screen' ? <p>SumUp visar en verifiering.</p> : null}
      {widgetState === 'fail' || widgetState === 'error' ? <p>SumUp avvisade försöket.</p> : null}
    </article>
  )
}
