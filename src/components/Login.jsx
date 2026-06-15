import { useState } from 'react'

function Login({ authError, authProvider, onLogin }) {
  const [mode, setMode] = useState('login')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    const username = String(formData.get('username') ?? '').trim()

    if (!email || !password) {
      setFormError('Fyll i e-post och lösenord.')
      return
    }

    if (password.length < 6) {
      setFormError('Lösenordet behöver vara minst 6 tecken.')
      return
    }

    setIsSubmitting(true)

    try {
      await onLogin({ email, mode, password, username })
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Kunde inte logga in just nu.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <p className="eyebrow">Version 2</p>
        <h1>PluggArena</h1>
        <p className="subtitle">
          Logga in med e-post, samla XP och plugga med ditt squad.
        </p>
        <div className="auth-tabs" aria-label="Välj auth-läge">
          <button
            className={mode === 'login' ? 'active' : ''}
            type="button"
            onClick={() => setMode('login')}
          >
            Logga in
          </button>
          <button
            className={mode === 'register' ? 'active' : ''}
            type="button"
            onClick={() => setMode('register')}
          >
            Registrera
          </button>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label>
              <span>Namn</span>
              <input
                name="username"
                placeholder="Hassan"
                autoComplete="given-name"
              />
            </label>
          )}
          <label>
            <span>E-post</span>
            <input
              name="email"
              placeholder="namn@example.com"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label>
            <span>Lösenord</span>
            <input
              name="password"
              placeholder="Minst 6 tecken"
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              required
            />
          </label>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Jobbar...'
              : mode === 'register'
                ? 'Skapa konto'
                : 'Logga in'}
          </button>
        </form>
        <p className="auth-note">
          {authProvider === 'supabase'
            ? 'Supabase Auth är aktivt.'
            : 'Supabase-nycklar saknas, så PluggArena sparar lokalt i den här webbläsaren.'}
        </p>
        {(formError || authError) && (
          <p className="auth-error">{formError || authError}</p>
        )}
      </section>
    </main>
  )
}

export default Login
