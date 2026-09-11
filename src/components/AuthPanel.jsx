import { useState } from 'react'
import {
  completePasswordRecovery,
  getAuthErrorMessage,
  requestPasswordReset,
} from '../services/authService.js'

function isRecoveryLink() {
  if (typeof window === 'undefined') {
    return false
  }

  return new URLSearchParams(window.location.search).get('passwordRecovery') === '1'
}

function AuthPanel({
  authError,
  authLoading,
  authNotice,
  authStatus,
  onSignIn,
  onSignUp,
}) {
  const [mode, setMode] = useState(() =>
    isRecoveryLink() ? 'choose-new-password' : 'sign-in',
  )
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState('')
  const [formNotice, setFormNotice] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const isConfigured = Boolean(authStatus?.authEnabled)
  const isRegistering = mode === 'sign-up'
  const isResettingPassword = mode === 'reset-password'
  const isChoosingNewPassword = mode === 'choose-new-password'
  const isBusy = authLoading || resetLoading

  function changeMode(nextMode) {
    setMode(nextMode)
    setFormError('')
    setFormNotice('')
    setPassword('')
    setConfirmPassword('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    setFormNotice('')

    if (isChoosingNewPassword) {
      if (!password || !confirmPassword) {
        setFormError('Fyll i det nya lösenordet två gånger.')
        return
      }

      if (password.length < 6) {
        setFormError('Lösenordet behöver vara minst 6 tecken.')
        return
      }

      if (password !== confirmPassword) {
        setFormError('Lösenorden matchar inte.')
        return
      }

      setResetLoading(true)
      const { error } = await completePasswordRecovery(password)
      setResetLoading(false)

      if (error) {
        setFormError(getAuthErrorMessage(error))
        return
      }

      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', window.location.pathname)
      }

      setPassword('')
      setConfirmPassword('')
      setMode('sign-in')
      setFormNotice('Lösenordet är ändrat. Logga in med ditt nya lösenord.')
      return
    }

    const normalizedEmail = email.trim()

    if (!normalizedEmail) {
      setFormError('Fyll i din e-postadress.')
      return
    }

    if (isResettingPassword) {
      setResetLoading(true)

      const { error } = await requestPasswordReset(normalizedEmail)

      setResetLoading(false)

      if (error) {
        setFormError(getAuthErrorMessage(error))
        return
      }

      setFormNotice(
        'Om det finns ett konto med den e-postadressen skickas en länk för att välja ett nytt lösenord.',
      )
      return
    }

    if (!password) {
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
        <h1>
          {isChoosingNewPassword
            ? 'Välj nytt lösenord'
            : isResettingPassword
              ? 'Glömt lösenord?'
              : 'Logga in'}
        </h1>
        <p className="welcome-subtitle">
          {isChoosingNewPassword
            ? 'Skriv ditt nya lösenord två gånger och spara det.'
            : isResettingPassword
              ? 'Ange e-postadressen till ditt konto så skickar vi en återställningslänk.'
              : 'Använd e-post och lösenord. Din vikt, mat, check-ins, bilder och chatt ligger fortfarande lokalt i den här webbläsaren.'}
        </p>

        {!isResettingPassword && !isChoosingNewPassword && (
          <div className="welcome-actions">
            <button
              className={mode === 'sign-in' ? '' : 'secondary-button'}
              type="button"
              onClick={() => changeMode('sign-in')}
            >
              Logga in
            </button>
            <button
              className={mode === 'sign-up' ? '' : 'secondary-button'}
              type="button"
              onClick={() => changeMode('sign-up')}
            >
              Registrera
            </button>
          </div>
        )}

        <form className="onboarding-form" onSubmit={handleSubmit}>
          {!isChoosingNewPassword && (
            <label className="field">
              <span>E-post</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="namn@example.com"
                disabled={!isConfigured || isBusy}
                required
              />
            </label>
          )}

          {!isResettingPassword && (
            <label className="field">
              <span>{isChoosingNewPassword ? 'Nytt lösenord' : 'Lösenord'}</span>
              <input
                type="password"
                autoComplete={isRegistering || isChoosingNewPassword ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minst 6 tecken"
                disabled={!isConfigured || isBusy}
                required
              />
            </label>
          )}

          {isChoosingNewPassword && (
            <label className="field">
              <span>Upprepa nytt lösenord</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Skriv lösenordet igen"
                disabled={!isConfigured || isBusy}
                required
              />
            </label>
          )}

          <button type="submit" disabled={!isConfigured || isBusy}>
            {isBusy
              ? 'Kontrollerar...'
              : isChoosingNewPassword
                ? 'Spara nytt lösenord'
                : isResettingPassword
                  ? 'Skicka återställningslänk'
                  : isRegistering
                    ? 'Skapa konto'
                    : 'Logga in'}
          </button>

          {mode === 'sign-in' && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => changeMode('reset-password')}
              disabled={!isConfigured || isBusy}
            >
              Glömt lösenord?
            </button>
          )}

          {isResettingPassword && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => changeMode('sign-in')}
              disabled={isBusy}
            >
              Tillbaka till inloggning
            </button>
          )}
        </form>

        {!isConfigured && (
          <p className="welcome-note">
            Supabase Auth är inte konfigurerat ännu. Lägg till
            VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY för att aktivera
            inloggning.
          </p>
        )}

        {(formNotice || authNotice) && (
          <p className="welcome-note">{formNotice || authNotice}</p>
        )}

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
