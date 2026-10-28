import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../services/supabaseClient.js'

// Visas när kunden kommer tillbaka från SumUp (?vk_checkout=<köp-id>).
// Sidan frågar bara servern; servern hämtar och verifierar betalningen själv.
// Återkomsten i sig ger aldrig tillgång.

const POLL_MS = 3000
const MAX_POLLS = 40

const MESSAGES = Object.freeze({
  cancelled: 'Köpet slutfördes inte: betalningen avbröts eller gick ut. Inget abonnemang har registrerats.',
  failed: 'Betalningen misslyckades. Inget abonnemang har registrerats. Du kan försöka igen.',
  paid: 'Betalningen är bekräftad.',
  pending: 'Väntar på bekräftelse från SumUp …',
  review: 'Betalningen behöver kontrolleras manuellt innan planen kan aktiveras. Kontakta supporten om det inte löser sig.',
  slow: 'Betalningen är ännu inte bekräftad. Det kan ta en stund. Du kan kontrollera igen.',
  unknown: 'Betalningsstatus kunde inte hämtas just nu.',
})

function clearReturnParam() {
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete('vk_checkout')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  } catch {
    /* Lämna adressen orörd. */
  }
}

async function fetchStatus(checkoutId) {
  if (!supabase) return { state: 'unknown' }
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) return { state: 'unknown' }
  const response = await fetch('/api/billing/checkout/status', {
    body: JSON.stringify({ checkout_id: checkoutId }),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const payload = await response.json().catch(() => null)
  const state = typeof payload?.state === 'string' ? payload.state : 'unknown'
  return {
    currentPeriodEnd: payload?.accessGranted === true ? payload.currentPeriodEnd : '',
    state: state === 'paid' && payload?.accessGranted !== true ? 'unknown' : state,
  }
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return ''
  }
}

export default function CheckoutReturnStatus({ checkoutId, onPaid, fetchImpl = fetchStatus }) {
  const [status, setStatus] = useState({ state: 'pending', currentPeriodEnd: '' })
  const [round, setRound] = useState(0)
  const polls = useRef(0)
  const active = useRef(true)

  const check = useCallback(async () => {
    let result
    try {
      result = await fetchImpl(checkoutId)
    } catch {
      result = { state: 'unknown' }
    }
    if (!active.current) return 'stop'
    polls.current += 1
    if (result.state === 'pending' && polls.current >= MAX_POLLS) {
      setStatus({ state: 'slow', currentPeriodEnd: '' })
      return 'stop'
    }
    setStatus({ state: result.state, currentPeriodEnd: result.currentPeriodEnd || '' })
    if (result.state === 'pending') return 'again'
    if (result.state === 'paid') onPaid?.()
    if (['paid', 'cancelled', 'failed'].includes(result.state)) clearReturnParam()
    return 'stop'
  }, [checkoutId, fetchImpl, onPaid])

  useEffect(() => {
    active.current = true
    let timer = null
    async function loop() {
      if ((await check()) === 'again' && active.current) timer = setTimeout(loop, POLL_MS)
    }
    timer = setTimeout(loop, 0)
    return () => {
      active.current = false
      clearTimeout(timer)
    }
  }, [check, round])

  const message = MESSAGES[status.state] || MESSAGES.unknown
  const tone = status.state === 'paid' ? 'form-success' : ['failed', 'review'].includes(status.state) ? 'form-error' : ''
  return (
    <div className="checkout-return-status" role="status" aria-live="polite" aria-busy={status.state === 'pending'}>
      <p className={tone}>
        {message}
        {status.state === 'paid' && status.currentPeriodEnd ? ` Planen gäller till ${formatDate(status.currentPeriodEnd)}.` : ''}
      </p>
      {['slow', 'unknown'].includes(status.state) ? (
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            polls.current = 0
            setStatus({ state: 'pending', currentPeriodEnd: '' })
            setRound((value) => value + 1)
          }}
        >
          Kontrollera igen
        </button>
      ) : null}
    </div>
  )
}
