import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../services/supabaseClient.js'
import {
  formatSandboxDiagnosticResult,
  previewSandboxDiagnosticEnabled,
} from './sandboxMerchantDiagnosticButton.js'

export default function SandboxMerchantDiagnosticButton({
  enabled = previewSandboxDiagnosticEnabled(),
} = {}) {
  const [admin, setAdmin] = useState(false)
  const [notice, setNotice] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    async function load() {
      if (!supabase) return
      const { data } = await supabase.auth.getSession()
      const accessToken = data?.session?.access_token || ''
      if (!accessToken) return
      const response = await fetch('/api/billing/capability', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const payload = await response.json().catch(() => null)
      if (cancelled || !response.ok || payload?.billing_admin !== true) return
      setAdmin(true)
    }
    load().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [enabled])

  async function runCheck() {
    if (started.current || !supabase) return
    started.current = true
    setNotice('')
    try {
      const { data } = await supabase.auth.getSession()
      const accessToken = data?.session?.access_token || ''
      if (!accessToken) {
        setNotice('AUTH_REQUIRED')
        return
      }
      const response = await fetch('/api/billing/sandbox-merchant-check', {
        headers: { Authorization: `Bearer ${accessToken}` },
        method: 'GET',
      })
      const payload = await response.json().catch(() => null)
      setNotice(formatSandboxDiagnosticResult(payload, response.status))
    } catch {
      setNotice('DIAGNOSTIC_FAILED')
    }
  }

  if (!enabled || !admin) return null

  return (
    <section className="app-information" aria-labelledby="sandbox-merchant-diagnostic-title">
      <h3 id="sandbox-merchant-diagnostic-title">SumUp Sandbox</h3>
      <button className="secondary-button" type="button" onClick={runCheck} disabled={Boolean(notice)}>
        Kontrollera Sandbox-handlare
      </button>
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  )
}
