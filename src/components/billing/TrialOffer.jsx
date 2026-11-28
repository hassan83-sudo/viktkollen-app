import { useEffect, useState } from 'react'
import { getCurrentAiAuthorization } from '../../services/ai/aiAuthTransport.js'

export default function TrialOffer({ onStarted }) {
  const [state, setState] = useState('checking')
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    async function load() {
      const auth = await getCurrentAiAuthorization()
      if (!auth.ok) return
      const response = await fetch('/api/billing/trial', { headers: { Authorization: auth.authorizationHeader } })
      const data = await response.json()
      if (active) setState(response.ok && data.trial?.eligible ? 'eligible' : 'unavailable')
    }
    load().catch(() => { if (active) setState('unavailable') })
    return () => { active = false }
  }, [])

  async function start() {
    if (state !== 'eligible') return
    setState('starting')
    setMessage('')
    try {
      const auth = await getCurrentAiAuthorization()
      if (!auth.ok) throw new Error('Logga in med e-postadress och lösenord.')
      const response = await fetch('/api/billing/trial', {
        method: 'POST', headers: { Authorization: auth.authorizationHeader },
      })
      const data = await response.json()
      if (!response.ok || !data.ok) {
        const messages = {
          EMAIL_PASSWORD_REQUIRED: 'Kontot behöver e-postadress och lösenord för att starta provperioden.',
          TRIAL_ALREADY_USED: 'Det här kontot har redan använt sin provperiod.',
          ACTIVE_PERIOD_EXISTS: 'Du har redan ett aktivt abonnemang.',
          CHECKOUT_IN_PROGRESS: 'Du har en påbörjad betalning. Slutför den eller vänta tills den går ut.',
        }
        throw new Error(messages[data.error?.code] || 'Provperioden kunde inte startas. Försök igen.')
      }
      setState('started')
      setMessage('Din provperiod har startat. Den slutar automatiskt efter 30 dagar.')
      window.dispatchEvent(new Event('viktkollen:subscription-changed'))
      onStarted?.()
    } catch (error) {
      setState('eligible')
      setMessage(error.message)
    }
  }

  return <>
    {['eligible', 'starting'].includes(state) && <div>
      <button type="button" disabled={state === 'starting'} onClick={start}>
        {state === 'starting' ? 'Startar provperiod…' : 'Starta 30 dagar gratis'}
      </button>
      <p>Alla abonnemangsfunktioner och totalt 5 skanningar för mat och AI Natur under 30 dagar. Endast en provperiod per konto. Inga betalningsuppgifter, ingen bindningstid och ingen automatisk debitering. Sparad information behålls.</p>
    </div>}
    {message && <p role="status">{message}</p>}
  </>
}
