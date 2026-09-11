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

function isPasswordRecoveryRequest() {
  if (typeof window === 'undefined') {
    return false
  }

  return new URLSearchParams(window.location.search).get('passwordRecovery') === '1'
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

export function getAuthErrorMessage(error) {
  const message = String(error?.message || '').toLocaleLowerCase('sv-SE')

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

  return error?.message || 'Något gick fel med autentiseringen.'
}

export async function getCurrentAuthSession() {
  if (!supabase) {
    return getAuthUnavailableResult()
  }

  const result =
    typeof window === 'undefined'
      ? await supabase.auth.getSession()
      : await withTimeout(supabase.auth.getSession(), AUTH_SESSION_TIMEOUT_MS)

  if (isPasswordRecoveryRequest() && result?.data) {
    return {
      ...result,
      data: {
        ...result.data,
        session: null,
      },
    }
  }

  return result
}

export function subscribeToAuthChanges(onChange) {
  if (!supabase) {
    return () => {}
  }

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' || isPasswordRecoveryRequest()) {
      onChange(null)
      return
    }

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

export async function requestPasswordReset(email) {
  if (!supabase) {
    return getAuthUnavailableResult()
  }

  const redirectTo =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?passwordRecovery=1`
      : undefined

  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  })
}

export async function completePasswordRecovery(password) {
  if (!supabase) {
    return getAuthUnavailableResult()
  }

  const result = await supabase.auth.updateUser({ password })

  if (result.error) {
    return result
  }

  const signOutResult = await supabase.auth.signOut()

  if (signOutResult.error) {
    return signOutResult
  }

  return result
}

export async function signOut() {
  if (!supabase) {
    return getAuthUnavailableResult()
  }

  return supabase.auth.signOut()
}
