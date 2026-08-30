import { useState } from 'react'

function AuthPanel({
  authError,
  authLoading,
  authNotice,
  authStatus,
  onSignIn,
  onSignInWithGoogle,
  onSignUp,
}) {
  const [mode, setMode] = useState('sign-in')
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState('')
  const [password, setPassword] = useState('')
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false)
  const isConfigured = Boolean(authStatus?.authEnabled)
  const isRegistering = mode === 'sign-up'

  async function handleGoogleClick() {
    if (!isConfigured || authLoading || isGoogleSubmitting || !onSignInWithGoogle) {
      return
    }

    setIsGoogleSubmitting(true)
    setFormError('')

    try {
      await onSignInWithGoogle()
    } catch (err) {
      setFormError(err?.message || 'Kunde inte starta Google-inloggning.')
    } finally {
      setIsGoogleSubmitting(false)
    }
  }

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
          Använd Google eller e-post och lösenord. Din vikt, mat, check-ins, bilder och chatt
          ligger fortfarande lokalt i den här webbläsaren.
        </p>

        <div className="google-auth-container">
          <button
            type="button"
            className="google-auth-button"
            onClick={handleGoogleClick}
            disabled={!isConfigured || authLoading || isGoogleSubmitting}
          >
            <svg
              className="google-icon"
              width="18"
              height="18"
              viewBox="0 0 18 18"
              aria-hidden="true"
              focusable="false"
            >
              <path
                fill="#4285F4"
                d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
              />
              <path
                fill="#34A853"
                d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.0359-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
              />
              <path
                fill="#FBBC05"
                d="M3.9641 10.71c-.18-.54-.2823-1.1168-.2823-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418l3.0068-2.3318z"
              />
              <path
                fill="#EA4335"
                d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
              />
            </svg>
            <span>
              {isGoogleSubmitting || (authLoading && !email)
                ? 'Omdirigerar till Google...'
                : 'Fortsätt med Google'}
            </span>
          </button>
        </div>

        <div className="auth-divider" role="separator" aria-label="eller">
          <span>eller</span>
        </div>

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
            {authLoading && email
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
