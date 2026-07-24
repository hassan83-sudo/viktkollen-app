import {
  getSupabaseStatus,
  isSupabaseConfigured,
  supabase,
} from './supabaseClient.js'

function getAuthUnavailableResult() {
  return {
    data: null,
    error: new Error('Supabase Auth är inte konfigurerat ännu.'),
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

  return supabase.auth.getSession()
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

export async function signOut() {
  if (!supabase) {
    return getAuthUnavailableResult()
  }

  return supabase.auth.signOut()
}
