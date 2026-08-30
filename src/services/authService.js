import {
  getSupabaseStatus,
  isSupabaseConfigured,
  supabase,
} from './supabaseClient.js'

const AUTH_SESSION_TIMEOUT_MS = 5000

function createAuthTimeoutResult() {
  return {
    data: { session: null },
    error: new Error('Kunde inte bekräfta sessionen just nu.'),
  }
}

function getAuthUnavailableResult() {
  return {
    data: null,
    error: new Error('Supabase Auth är inte konfigurerat ännu.'),
  }
}

async function withTimeout(promise, timeoutMs) {
  let timeoutId

  const timeout = new Promise((resolve) => {
    timeoutId = window.setTimeout(() => {
      resolve(createAuthTimeoutResult())
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export function getAuthStatus() {
  return {
    ...getSupabaseStatus(),
    authEnabled: isSupabaseConfigured(),
  }
}

export function getOAuthRedirectUrl() {
  if (typeof window === 'undefined') {
    return undefined
  }

  return `${window.location.origin}${window.location.pathname || '/'}`
}

export function getUrlAuthError() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const searchParams = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(
      window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash,
    )

    const error = searchParams.get('error') || hashParams.get('error')
    const errorDescription =
      searchParams.get('error_description') || hashParams.get('error_description')
    const errorCode =
      searchParams.get('error_code') || hashParams.get('error_code')

    if (error || errorDescription || errorCode) {
      return {
        code: errorCode || null,
        error: error || 'oauth_error',
        message: errorDescription
          ? decodeURIComponent(errorDescription.replace(/\+/g, ' '))
          : error || 'OAuth-fel',
      }
    }
  } catch {
    // Ignore URL parse errors
  }

  return null
}

export function getAuthErrorMessage(error) {
  const message = String(
    error?.message || error?.error_description || error?.error || error || '',
  ).toLocaleLowerCase('sv-SE')

  if (!message) {
    return 'Något gick fel med autentiseringen.'
  }

  if (message.includes('invalid login credentials')) {
    return 'Fel e-post eller lösenord.'
  }

  if (message.includes('email not confirmed')) {
    return 'E-postadressen behöver bekräftas innan du kan logga in.'
  }

  if (message.includes('password')) {
    return 'Lösenordet behöver vara minst 6 tecken.'
  }

  if (message.includes('already registered') || message.includes('already exists')) {
    return 'Det finns redan ett konto med den e-postadressen.'
  }

  if (message.includes('rate limit')) {
    return 'För många försök just nu. Vänta en stund och försök igen.'
  }

  if (message.includes('supabase auth är inte konfigurerat')) {
    return 'Supabase Auth är inte konfigurerat ännu.'
  }

  if (
    message.includes('access_denied') ||
    message.includes('user cancelled') ||
    message.includes('cancelled') ||
    message.includes('avbröts') ||
    message.includes('avbruten')
  ) {
    return 'Inloggningen med Google avbröts.'
  }

  if (
    message.includes('provider is not enabled') ||
    message.includes('unsupported provider') ||
    message.includes('google provider is not enabled')
  ) {
    return 'Google-inloggning är inte aktiverad i Supabase.'
  }

  if (message.includes('popup') || message.includes('blocked')) {
    return 'Webbläsaren blockerade inloggningen. Tillåt omdirigering och försök igen.'
  }

  return (
    error?.message ||
    error?.error_description ||
    (typeof error === 'string' ? error : 'Något gick fel med autentiseringen.')
  )
}

export async function getCurrentAuthSession() {
  if (!supabase) {
    return getAuthUnavailableResult()
  }

  if (typeof window === 'undefined') {
    return supabase.auth.getSession()
  }

  return withTimeout(supabase.auth.getSession(), AUTH_SESSION_TIMEOUT_MS)
}

export function subscribeToAuthChanges(onChange) {
  if (!supabase) {
    return () => {}
  }

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    onChange(session)
  })

  return () => {
    data.subscription.unsubscribe()
  }
}

export async function signUpWithEmail({ email, password }) {
  if (!supabase) {
    return getAuthUnavailableResult()
  }

  return supabase.auth.signUp({
    email,
    password,
  })
}

export async function signInWithEmail({ email, password }) {
  if (!supabase) {
    return getAuthUnavailableResult()
  }

  return supabase.auth.signInWithPassword({
    email,
    password,
  })
}

export async function signInWithGoogle({ redirectTo } = {}) {
  if (!supabase) {
    return getAuthUnavailableResult()
  }

  const targetRedirectTo = redirectTo || getOAuthRedirectUrl()

  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: targetRedirectTo ? { redirectTo: targetRedirectTo } : {},
  })
}

export async function signOut() {
  if (!supabase) {
    return getAuthUnavailableResult()
  }

  return supabase.auth.signOut()
}
