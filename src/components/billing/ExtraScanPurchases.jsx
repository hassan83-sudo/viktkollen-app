import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient.js'

export default function ExtraScanPurchases() {
  const [catalog, setCatalog] = useState([])
  const [batches, setBatches] = useState([])
  const [feature, setFeature] = useState('food.scan')
  const [quantity, setQuantity] = useState(1)
  const [intent, setIntent] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function call(body) {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (!token) throw new Error('AUTH_REQUIRED')
    const response = await fetch('/api/billing/extra-scans', {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const result = await response.json()
    if (!response.ok || !result.ok) throw new Error('PURCHASE_UNAVAILABLE')
    return result
  }
  useEffect(() => {
    let active = true
    call().then(result => { if (active) { setCatalog(Array.isArray(result.catalog) ? result.catalog : []); setBatches(Array.isArray(result.batches) ? result.batches : []) } }).catch(() => {})
    return () => { active = false }
  }, [])
  if (!catalog.length) return null
  const selected = catalog.find(row => row.feature === feature)
  async function purchase() {
    setBusy(true); setMessage('')
    try {
      // Retain idempotency key across failures; only explicit selection changes reset it.
      const key = intent?.key || crypto.randomUUID()
      setIntent(previous => ({ ...previous, key }))
      const result = await call({ action: 'create', feature, quantity, requestKey: key })
      setIntent({ ...result, key })
    } catch { setMessage('Köpet kunde inte förberedas. Försök igen.') }
    finally { setBusy(false) }
  }
  async function verify() {
    setBusy(true)
    try {
      const result = await call({ action: 'verify', id: intent.id })
      setBatches(result.batches)
      setMessage(result.payment.status === 'VERIFIED_PAID' ? 'Betalningen är bekräftad.' : 'Betalningen är ännu inte bekräftad.')
    } catch { setMessage('Betalningen kunde inte kontrolleras. Försök igen.') }
    finally { setBusy(false) }
  }
  return <section aria-label="Köp extra scanningar">
    <h4>Extra scanningar – sandbox</h4>
    <p>För gratis och betalande konton. Ditt abonnemang ändras inte.</p>
    <label>Typ <select disabled={busy || Boolean(intent?.id)} value={feature} onChange={event => { setFeature(event.target.value); setIntent(null) }}>
      {catalog.map(row => <option key={row.feature} value={row.feature}>{row.label}</option>)}
    </select></label>
    <label>Antal <input type="number" min="1" max="100" disabled={busy || Boolean(intent?.id)} value={quantity} onChange={event => { setQuantity(Number(event.target.value)); setIntent(null) }} /></label>
    <p>{new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(selected.unitPriceMinor * quantity / 100)} inklusive moms.</p>
    <p>Gäller exakt 30 dagar (720 timmar) från serverns betalningsbekräftelse. Slutdatum visas efter bekräftelsen. Månadskvoten används först.</p>
    {!intent?.id ? <button disabled={busy || !Number.isInteger(quantity) || quantity < 1 || quantity > 100} onClick={purchase}>Förbered köp</button> : <>
      <a href={intent.hostedUrl} target="_blank" rel="noopener noreferrer">Betala med SumUp</a>
      <button disabled={busy} onClick={verify}>Kontrollera betalning</button>
      <button disabled={busy} onClick={() => setIntent(null)}>Nytt köp</button>
    </>}
    <p role="status">{message}</p>
    <ul>{batches.map(batch => <li key={batch.id}>{catalog.find(row => row.feature === batch.feature)?.label}: {batch.remaining} kvar. Gäller till {new Date(batch.expires_at).toLocaleString('sv-SE')}.</li>)}</ul>
  </section>
}
