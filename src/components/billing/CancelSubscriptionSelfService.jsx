import { useState } from 'react'
import { getCurrentAiAuthorization } from '../../services/ai/aiAuthTransport.js'
import { confirmScheduleCancel } from '../../features/aiHelp/aiHelpClient.js'

export default function CancelSubscriptionSelfService({ isAuthenticated = false }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')

  async function cancel() {
    if (busy) return
    setBusy(true)
    setResult('')
    try {
      const auth = await getCurrentAiAuthorization()
      if (!auth.ok) {
        setResult('Logga in igen för att säga upp abonnemanget.')
        return
      }
      const response = await confirmScheduleCancel(auth.userScope)
      if (response.ok && response.resolved === true && response.outcome === 'verified') {
        setResult('Uppsägningen är bekräftad. Abonnemanget avslutas vid betalperiodens slut.')
        setConfirming(false)
      } else {
        setResult('Uppsägningen kunde inte bekräftas. Ingen uppsägning har verifierats.')
      }
    } catch {
      setResult('Det gick inte att genomföra uppsägningen just nu. Försök igen.')
    } finally {
      setBusy(false)
    }
  }

  if (!isAuthenticated) return null
  return (
    <section className="app-information" aria-label="Säg upp abonnemang">
      <h3>Säg upp abonnemang</h3>
      <p>Du kan själv avsluta abonnemanget utan att kontakta kundtjänst. Abonnemanget gäller till betalperiodens slut.</p>
      {!confirming ? (
        <button type="button" onClick={() => { setResult(''); setConfirming(true) }}>Säg upp abonnemang</button>
      ) : (
        <div>
          <p>Vill du avsluta abonnemanget vid betalperiodens slut?</p>
          <button type="button" disabled={busy} onClick={cancel}>{busy ? 'Bearbetar…' : 'Bekräfta uppsägning'}</button>{' '}
          <button type="button" disabled={busy} onClick={() => setConfirming(false)}>Behåll abonnemanget</button>
        </div>
      )}
      {result && <p role="status">{result}</p>}
    </section>
  )
}
