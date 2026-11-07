import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../index.css'
import '../../dark-theme.css'
import '../../i18n/index.js'
import OutfitWardrobeSelection from './components/OutfitWardrobeSelection.jsx'
import { supabase } from '../../services/supabaseClient.js'

export default function WardrobeAiPreview() {
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null))
    return () => data.subscription.unsubscribe()
  }, [])
  async function login(event) {
    event.preventDefault()
    if (busy || !supabase) return
    setBusy(true); setNotice('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      setPassword('')
      if (error) setNotice('Inloggningen misslyckades. Använd ditt Staging-testkonto.')
    } catch { setNotice('Inloggningen är inte tillgänglig nu.') }
    finally { setBusy(false) }
  }
  return <main style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
    <h1>Garderob – AI-test</h1>
    <p>Separat Staging. Fota ett plagg åt gången. Godkända bilder sparas bara i denna webbläsarprofil.</p>
    {!user ? <form onSubmit={login}>
      <label>E-post för testkonto<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Lösenord<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <button disabled={busy || !supabase}>Logga in i Staging</button>
      <p role="status">{notice}</p>
    </form> : <>
      <button onClick={async () => { setBusy(true); try { const { error } = await supabase.auth.signOut(); if (error) setNotice('Utloggningen misslyckades.') } finally { setBusy(false) } }} disabled={busy}>Logga ut</button>
      <p role="status">{notice}</p>
      <OutfitWardrobeSelection key={user.id} />
    </>}
  </main>
}

createRoot(document.getElementById('root')).render(<StrictMode><WardrobeAiPreview /></StrictMode>)
