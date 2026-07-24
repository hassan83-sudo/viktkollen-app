import { useState } from 'react'

function AuthPanel({
  authError,
  authLoading,
  authNotice,
  authStatus,
  onSignIn,
  onSignUp,
}) {
  const [mode, setMode] = useState('sign-in')
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState('')
  const [password, setPassword] = useState('')
  const isConfigured = Boolean(authStatus?.authEnabled)
  const isRegistering = mode === 'sign-up'

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')

    const normalizedEmail = email.trim()

    if (!normalizedEmail || !password) {
      setFormError('Fyll i e-post och lösenord.')
      return
    }

    if (password.length < 6) {
      setFormError('Lösenordet behöver vara minst 6 tecken.')
      return
    }

    if (isRegistering) {
      await onSignUp({ email: normalizedEmail, password })
    } else {
      await onSignIn({ email: normalizedEmail, password })
    }
  }

  return (
    <main className="app-shell welcome-shell">
      <section className="welcome-card">
        <p className="eyebrow">Viktkollen Auth</p>
        <h1>Logga in</h1>
        <p className="welcome-subtitle">
          Använd e-post och lösenord. Din vikt, mat, check-ins, bilder och chatt
          ligger fortfarande lokalt i den här webbläsaren.
        </p>

        <div className="welcome-actions">
          <button
            className={mode === 'sign-in' ? '' : 'secondary-button'}
            type="button"
            onClick={() => setMode('sign-in')}
          >
            Logga in
          </button>
          <button
            className={mode === 'sign-up' ? '' : 'secondary-button'}
            type="button"
            onClick={() => setMode('sign-up')}
          >
            Registrera
          </button>
        </div>

        <form className="onboarding-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>E-post</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="namn@example.com"
              disabled={!isConfigured || authLoading}
              required
            />
          </label>

          <label className="field">
            <span>Lösenord</span>
            <input
              type="password"
              autoComplete={isRegistering ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minst 6 tecken"
              disabled={!isConfigured || authLoading}
              required
            />
          </label>

          <button type="submit" disabled={!isConfigured || authLoading}>
            {authLoading
              ? 'Kontrollerar...'
              : isRegistering
                ? 'Skapa konto'
                : 'Logga in'}
          </button>
        </form>

        {!isConfigured && (
          <p className="welcome-note">
            Supabase Auth är inte konfigurerat ännu. Lägg till
            VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY för att aktivera
            inloggning.
          </p>
        )}

        {authNotice && <p className="welcome-note">{authNotice}</p>}

        {(formError || authError) && (
          <p className="form-error" role="alert">
            {formError || authError}
          </p>
        )}
      </section>
    </main>
  )
}

export default AuthPanel
