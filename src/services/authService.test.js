/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAuthErrorMessage,
  getOAuthRedirectUrl,
  getUrlAuthError,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  signOut,
} from './authService.js'
import * as supabaseClientModule from './supabaseClient.js'

describe('authService', () => {
  const originalLocation = window.location

  beforeEach(() => {
    delete window.location
    window.location = {
      hash: '',
      origin: 'https://viktkollen.se',
      pathname: '/app',
      search: '',
    }
  })

  afterEach(() => {
    window.location = originalLocation
    vi.restoreAllMocks()
  })

  describe('getOAuthRedirectUrl', () => {
    it('returns the current origin with pathname', () => {
      expect(getOAuthRedirectUrl()).toBe('https://viktkollen.se/app')
    })

    it('handles root pathname properly', () => {
      window.location.pathname = '/'
      expect(getOAuthRedirectUrl()).toBe('https://viktkollen.se/')
    })
  })

  describe('getUrlAuthError', () => {
    it('returns null when no error is in query or hash', () => {
      window.location.search = ''
      window.location.hash = ''
      expect(getUrlAuthError()).toBeNull()
    })

    it('detects OAuth error in query params', () => {
      window.location.search = '?error=access_denied&error_description=User+cancelled+the+login'
      window.location.hash = ''

      const result = getUrlAuthError()
      expect(result).toEqual({
        code: null,
        error: 'access_denied',
        message: 'User cancelled the login',
      })
    })

    it('detects OAuth error in hash fragment', () => {
      window.location.search = ''
      window.location.hash = '#error=access_denied&error_description=User+cancelled+OAuth+flow&error_code=403'

      const result = getUrlAuthError()
      expect(result).toEqual({
        code: '403',
        error: 'access_denied',
        message: 'User cancelled OAuth flow',
      })
    })
  })

  describe('getAuthErrorMessage', () => {
    it('translates access_denied / user cancelled to Swedish', () => {
      expect(getAuthErrorMessage({ error: 'access_denied' })).toBe('Inloggningen med Google avbröts.')
      expect(getAuthErrorMessage(new Error('User cancelled sign in'))).toBe('Inloggningen med Google avbröts.')
    })

    it('translates provider not enabled error', () => {
      expect(getAuthErrorMessage(new Error('Google provider is not enabled'))).toBe(
        'Google-inloggning är inte aktiverad i Supabase.',
      )
    })

    it('translates popup / blocked error', () => {
      expect(getAuthErrorMessage(new Error('Popup window blocked by browser'))).toBe(
        'Webbläsaren blockerade inloggningen. Tillåt omdirigering och försök igen.',
      )
    })

    it('translates standard email auth errors', () => {
      expect(getAuthErrorMessage(new Error('Invalid login credentials'))).toBe('Fel e-post eller lösenord.')
      expect(getAuthErrorMessage(new Error('Email not confirmed'))).toBe(
        'E-postadressen behöver bekräftas innan du kan logga in.',
      )
      expect(getAuthErrorMessage(new Error('Password should be at least 6 characters'))).toBe(
        'Lösenordet behöver vara minst 6 tecken.',
      )
      expect(getAuthErrorMessage(new Error('User already registered'))).toBe(
        'Det finns redan ett konto med den e-postadressen.',
      )
      expect(getAuthErrorMessage(new Error('Over rate limit'))).toBe(
        'För många försök just nu. Vänta en stund och försök igen.',
      )
    })

    it('falls back gracefully on unknown errors', () => {
      expect(getAuthErrorMessage(new Error('Nätverksfel'))).toBe('Nätverksfel')
      expect(getAuthErrorMessage(null)).toBe('Något gick fel med autentiseringen.')
    })
  })

  describe('signInWithGoogle', () => {
    it('returns unavailable error if supabase is not configured', async () => {
      vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(null)
      const result = await signInWithGoogle()
      expect(result.error).toBeDefined()
      expect(result.error.message).toContain('Supabase Auth är inte konfigurerat')
    })

    it('calls supabase.auth.signInWithOAuth with google provider and redirectTo', async () => {
      const mockSignInWithOAuth = vi.fn().mockResolvedValue({ data: { provider: 'google', url: 'https://accounts.google.com' }, error: null })
      const mockSupabase = {
        auth: {
          signInWithOAuth: mockSignInWithOAuth,
        },
      }
      vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase)

      const result = await signInWithGoogle()
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: 'https://viktkollen.se/app',
        },
      })
      expect(result.data.provider).toBe('google')
    })
  })

  describe('email auth baseline operations', () => {
    it('calls signInWithPassword for email sign-in', async () => {
      const mockSignInWithPassword = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u-123' } } }, error: null })
      const mockSupabase = {
        auth: {
          signInWithPassword: mockSignInWithPassword,
        },
      }
      vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase)

      const result = await signInWithEmail({ email: 'test@example.com', password: 'secretpassword' })
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'secretpassword',
      })
      expect(result.data.session.user.id).toBe('u-123')
    })

    it('calls signUp for email sign-up', async () => {
      const mockSignUp = vi.fn().mockResolvedValue({ data: { user: { id: 'u-456' } }, error: null })
      const mockSupabase = {
        auth: {
          signUp: mockSignUp,
        },
      }
      vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase)

      const result = await signUpWithEmail({ email: 'new@example.com', password: 'secretpassword' })
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'secretpassword',
      })
      expect(result.data.user.id).toBe('u-456')
    })

    it('calls signOut for sign-out', async () => {
      const mockSignOut = vi.fn().mockResolvedValue({ error: null })
      const mockSupabase = {
        auth: {
          signOut: mockSignOut,
        },
      }
      vi.spyOn(supabaseClientModule, 'supabase', 'get').mockReturnValue(mockSupabase)

      const result = await signOut()
      expect(mockSignOut).toHaveBeenCalled()
      expect(result.error).toBeNull()
    })
  })
})
