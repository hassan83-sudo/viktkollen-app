import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient.js'

const CHECKOUT_ID = 'chk_3552adcebd09484eb0ff05629af65586'

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

function presentResult(payload) {
  if (!payload || payload.ok !== true) return ''
  const tokenPresent = payload.paymentInstrumentTokenPresent === true ? 'ja' : 'nej'
  return [
    `Status: ${payload.checkoutStatus || 'okänd'}`,
    `Exakt en SUCCESSFUL-transaktion: ${payload.exactlyOneSuccessfulTransaction === true ? 'ja' : 'nej'}`,
    `payment_instrument.token: ${tokenPresent}`,
    `SETUP_RECURRING_PAYMENT: ${payload.purposeSetupRecurring === true ? 'ja' : 'nej'}`,
    `Intent utgången: ${payload.intentExpired === true ? 'ja' : 'nej'}`,
  ].join('\n')
}

export default function SumUpCheckoutInspectAdmin() {
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
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
      if (cancelled) return
      setToken(accessToken)
      setStatus('ready')
    }
    load().catch(() => {
      if (!cancelled) setStatus('hidden')
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function inspectCheckout() {
    if (!token || pending) return
    setNotice('')
    setPending(true)
    try {
      const { payload, response } = await adminFetch(
        token,
        `/api/billing/sumup-checkout-inspect?checkout_id=${encodeURIComponent(CHECKOUT_ID)}`,
      )
      if (!response.ok || payload?.ok !== true) {
        setNotice(payload?.error?.code ? `Kontrollen misslyckades: ${payload.error.code}` : 'Kontrollen misslyckades.')
        return
      }
      setNotice(presentResult(payload))
    } catch {
      setNotice('Kontrollen misslyckades.')
    } finally {
      setPending(false)
    }
  }

  if (status === 'checking' || status === 'hidden') return null

  return (
    <section className="app-information" aria-labelledby="sumup-checkout-inspect-title">
      <details>
        <summary id="sumup-checkout-inspect-title">SumUp checkout-kontroll</summary>
        <p>Skrivskyddad kontroll av den redan betalda setup-checkouten. Ingen betalning eller aktivering.</p>
        <button type="button" disabled={pending} onClick={inspectCheckout}>
          {pending ? 'Kontrollerar…' : 'Kontrollera betald 12 SEK-checkout'}
        </button>
        {notice ? <pre role="status">{notice}</pre> : null}
      </details>
    </section>
  )
}
