import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient.js'

export default function SumUpSandboxIdentityAdmin() {
  const [allowed, setAllowed] = useState(false)
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    if (!supabase) return undefined
    let cancelled = false
    async function check() {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (!token) return
      const response = await fetch('/api/billing/capability', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => ({}))
      if (!cancelled) setAllowed(response.ok && payload.billing_admin === true)
    }
    check().catch(() => {})
    return () => { cancelled = true }
  }, [])

  async function verify() {
    setStatus('checking')
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (!token) { setStatus('auth'); return }
      const response = await fetch('/api/billing/admin?resource=sumup_sandbox_identity', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => ({}))
      if (response.ok && payload.code === 'SANDBOX_IDENTITY_VERIFIED') {
        setStatus('verified')
      } else if (response.status === 401) {
        setStatus('auth')
      } else if (response.status === 403) {
        setStatus('denied')
      } else {
        setStatus('failed')
      }
    } catch {
      setStatus('failed')
    }
  }

  if (import.meta.env.VITE_VERCEL_ENV === 'production' || !allowed) return null

  return (
    <section className="app-information" aria-label="SumUp Sandbox-kontroll">
      <details>
        <summary>SumUp Sandbox – administratörstest</summary>
        <p>Endast läsning. Skapar inga köp eller abonnemang.</p>
        <button type="button" onClick={verify} disabled={status === 'checking'}>
          {status === 'checking' ? 'Kontrollerar…' : 'Verifiera SumUp Sandbox'}
        </button>
        {status === 'verified' && <p role="status">Sandbox-handlaren verifierad.</p>}
        {status === 'auth' && <p role="alert">Inloggningstoken saknas. Logga in igen i testappen.</p>}
        {status === 'denied' && <p role="alert">Åtkomst nekad eller fel Sandbox-handlare.</p>}
        {status === 'failed' && <p role="alert">Kontrollen kunde inte slutföras. Kontrollera serverloggarna.</p>}
      </details>
    </section>
  )
}
