/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AuthPanel from './AuthPanel.jsx'

describe('AuthPanel', () => {
  const defaultAuthStatus = { authEnabled: true }

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders Google sign-in button and email form', () => {
    render(
      <AuthPanel
        authError=""
        authLoading={false}
        authNotice=""
        authStatus={defaultAuthStatus}
        onSignIn={vi.fn()}
        onSignInWithGoogle={vi.fn()}
        onSignUp={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /Fortsätt med Google/i })).toBeTruthy()
    expect(screen.getByRole('separator')).toBeTruthy()
    expect(screen.getByLabelText(/^E-post/i)).toBeTruthy()
    expect(screen.getByLabelText(/^Lösenord/i)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Logga in' }).length).toBeGreaterThanOrEqual(1)
  })

  it('triggers onSignInWithGoogle when clicking Fortsätt med Google', () => {
    const onSignInWithGoogle = vi.fn().mockResolvedValue({})

    render(
      <AuthPanel
        authError=""
        authLoading={false}
        authNotice=""
        authStatus={defaultAuthStatus}
        onSignIn={vi.fn()}
        onSignInWithGoogle={onSignInWithGoogle}
        onSignUp={vi.fn()}
      />,
    )

    const googleButton = screen.getByRole('button', { name: /Fortsätt med Google/i })
    fireEvent.click(googleButton)

    expect(onSignInWithGoogle).toHaveBeenCalledTimes(1)
  })

  it('prevents double-clicks and disables button while redirecting to Google', async () => {
    let resolveGoogleCall
    const pendingPromise = new Promise((resolve) => {
      resolveGoogleCall = resolve
    })
    const onSignInWithGoogle = vi.fn().mockReturnValue(pendingPromise)

    render(
      <AuthPanel
        authError=""
        authLoading={false}
        authNotice=""
        authStatus={defaultAuthStatus}
        onSignIn={vi.fn()}
        onSignInWithGoogle={onSignInWithGoogle}
        onSignUp={vi.fn()}
      />,
    )

    const googleButton = screen.getByRole('button', { name: /Fortsätt med Google/i })
    fireEvent.click(googleButton)

    // Immediate second click should be ignored because button is disabled / submitting
    fireEvent.click(googleButton)
    expect(onSignInWithGoogle).toHaveBeenCalledTimes(1)
    const redirectingButton = screen.getByRole('button', { name: /Omdirigerar till Google\.\.\./i })
    expect(redirectingButton.disabled).toBe(true)

    resolveGoogleCall({})
  })

  it('re-enables Google button and allows retry without page refresh when onSignInWithGoogle resolves with an error without throwing', async () => {
    const onSignInWithGoogle = vi.fn().mockResolvedValue({
      error: new Error('Google OAuth misslyckades'),
    })

    render(
      <AuthPanel
        authError=""
        authLoading={false}
        authNotice=""
        authStatus={defaultAuthStatus}
        onSignIn={vi.fn()}
        onSignInWithGoogle={onSignInWithGoogle}
        onSignUp={vi.fn()}
      />,
    )

    const googleButton = screen.getByRole('button', { name: /Fortsätt med Google/i })

    // First click
    fireEvent.click(googleButton)
    expect(onSignInWithGoogle).toHaveBeenCalledTimes(1)

    // Verify button becomes enabled again without page refresh
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Fortsätt med Google/i }).disabled).toBe(false)
    })

    // Second click (retry without refresh)
    fireEvent.click(screen.getByRole('button', { name: /Fortsätt med Google/i }))
    expect(onSignInWithGoogle).toHaveBeenCalledTimes(2)
  })

  it('disables Google and email actions when Supabase is not configured', () => {
    render(
      <AuthPanel
        authError=""
        authLoading={false}
        authNotice=""
        authStatus={{ authEnabled: false }}
        onSignIn={vi.fn()}
        onSignInWithGoogle={vi.fn()}
        onSignUp={vi.fn()}
      />,
    )

    const googleButton = screen.getByRole('button', { name: /Fortsätt med Google/i })
    expect(googleButton.disabled).toBe(true)
    expect(screen.getByLabelText(/^E-post/i).disabled).toBe(true)
    expect(screen.getByText(/Supabase Auth är inte konfigurerat ännu/i)).toBeTruthy()
  })

  it('submits email and password sign-in unchanged', () => {
    const onSignIn = vi.fn()

    render(
      <AuthPanel
        authError=""
        authLoading={false}
        authNotice=""
        authStatus={defaultAuthStatus}
        onSignIn={onSignIn}
        onSignInWithGoogle={vi.fn()}
        onSignUp={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText(/^E-post/i), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/^Lösenord/i), {
      target: { value: 'secretpass' },
    })

    const submitButtons = screen.getAllByRole('button', { name: 'Logga in' })
    const submitButton = submitButtons[submitButtons.length - 1]
    fireEvent.click(submitButton)

    expect(onSignIn).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'secretpass',
    })
  })

  it('renders auth errors and notices correctly', () => {
    render(
      <AuthPanel
        authError="Inloggningen med Google avbröts."
        authNotice="Kontrollera din e-post."
        authLoading={false}
        authStatus={defaultAuthStatus}
        onSignIn={vi.fn()}
        onSignInWithGoogle={vi.fn()}
        onSignUp={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain('Inloggningen med Google avbröts.')
    expect(screen.getByText('Kontrollera din e-post.')).toBeTruthy()
  })
})
