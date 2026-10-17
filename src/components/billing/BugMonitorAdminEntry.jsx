import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient.js'
import BugMonitorPanel from './BugMonitorPanel.jsx'
import SupportPanel from '../../features/aiHelp/SupportPanel.jsx'

// Shown only when the server says this session is a billing admin. Every
// /api/bug-monitor call is still checked by the server; this only decides
// whether the entry is rendered. It does not depend on the plan list.
export default function BugMonitorAdminEntry() {
  const [token, setToken] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!supabase) return
      const { data } = await supabase.auth.getSession()
      const accessToken = data?.session?.access_token || ''
      if (!accessToken) return
      const response = await fetch('/api/billing/capability', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const payload = await response.json().catch(() => ({}))
      if (cancelled || !response.ok || payload?.billing_admin !== true) return
      setToken(accessToken)
    }
    load().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!token) return null

  return (
    <section className="app-information" aria-label="AI Bug Monitor">
      <BugMonitorPanel token={token} />
      <SupportPanel admin />
    </section>
  )
}
