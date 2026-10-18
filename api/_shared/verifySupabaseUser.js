import { createClient } from '@supabase/supabase-js'
import { aiRouteErrorCodes, makeSafeAiRouteError } from './aiRouteErrors.js'
import { SECURITY_EVENT_TYPES } from '../../src/services/security/securityEvents.js'
import { queueSecurityEvent } from './security/securityEventStore.js'
import { recordBurst, requestSourceKey } from './security/securityGuard.js'

const DEFAULT_AUTH_TIMEOUT_MS = 5000
const INVALID_TOKEN_BURST = Object.freeze({ threshold: 10, windowMs: 5 * 60 * 1000 })

// Forged or garbage tokens from one source. Expired sessions, missing tokens
// and Auth outages are normal and never counted. The source is a hash kept
// in memory only.
function noteInvalidToken(request) {
  try {
    if (recordBurst('invalid-token', requestSourceKey(request), INVALID_TOKEN_BURST)) {
      queueSecurityEvent({ feature: 'api-auth', type: SECURITY_EVENT_TYPES.AUTH_FAILURE_BURST })
    }
  } catch {
    // Monitoring must never change the authentication result.
  }
}

function getHeader(request, name) {
  const headers = request?.headers || {}
  return headers[name] || headers[name.toLowerCase()] || ''
}

function getBearerToken(request) {
  const header = String(getHeader(request, 'authorization') || '').trim()
  if (!header) return { code: 'missingAuthorization' }
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) return { code: 'invalidAuthorization' }
  const token = match[1].trim()
  if (!token) return { code: 'invalidAuthorization' }
  return { token }
}

function timeoutPromise(ms) {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ error: { code: 'authTimeout' } }), ms)
  })
}

function getSupabaseServerConfig(env = process.env) {
  return {
    anonKey: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '',
    url: env.SUPABASE_URL || env.VITE_SUPABASE_URL || '',
  }
}

function createSupabaseVerifier(env = process.env) {
  const config = getSupabaseServerConfig(env)
  if (!config.url || !config.anonKey) {
    return async () => ({ error: { code: 'authUnavailable' } })
  }

  const client = createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return async (token) => {
    const { data, error } = await client.auth.getUser(token)
    if (error) return { error }
    return { user: data?.user || null }
  }
}

let verifierOverride = null

export function setSupabaseAuthVerifierForTests(verifier = null) {
  verifierOverride = verifier
}

function mapAuthResult(error) {
  const text = String(error?.code || error?.message || '').toLowerCase()
  if (text.includes('timeout')) return 'authTimeout'
  if (text.includes('expired') || text.includes('jwt expired')) return 'expiredSession'
  if (text.includes('unavailable') || text.includes('fetch') || text.includes('network')) return 'authUnavailable'
  return 'invalidSession'
}

function makeAuthError(code, requestId = '') {
  const mapping = {
    authTimeout: [aiRouteErrorCodes.AUTH_UNAVAILABLE, 503, true],
    authUnavailable: [aiRouteErrorCodes.AUTH_UNAVAILABLE, 503, true],
    expiredSession: [aiRouteErrorCodes.AUTH_EXPIRED, 401, false],
    invalidAuthorization: [aiRouteErrorCodes.AUTH_INVALID, 401, false],
    invalidSession: [aiRouteErrorCodes.AUTH_INVALID, 401, false],
    missingAuthorization: [aiRouteErrorCodes.AUTH_REQUIRED, 401, false],
  }
  const [safeCode, status, retryable] = mapping[code] || mapping.invalidSession
  return makeSafeAiRouteError({ code: safeCode, requestId, retryable, status })
}

export async function verifySupabaseUser(request, {
  env = process.env,
  requestId = '',
  timeoutMs = DEFAULT_AUTH_TIMEOUT_MS,
  verifier,
} = {}) {
  const parsed = getBearerToken(request)
  if (!parsed.token) {
    if (parsed.code === 'invalidAuthorization') noteInvalidToken(request)
    return {
      authenticated: false,
      ...makeAuthError(parsed.code, requestId),
    }
  }

  const verify = verifier || verifierOverride || createSupabaseVerifier(env)
  const result = await Promise.race([
    verify(parsed.token),
    timeoutPromise(timeoutMs),
  ])
  if (result?.error) {
    const code = mapAuthResult(result.error)
    if (code === 'invalidSession') noteInvalidToken(request)
    return {
      authenticated: false,
      ...makeAuthError(code, requestId),
    }
  }

  if (!result?.user?.id) {
    noteInvalidToken(request)
    return {
      authenticated: false,
      ...makeAuthError('invalidSession', requestId),
    }
  }

  return {
    authenticated: true,
    user: {
      createdAt: typeof result.user.created_at === 'string' ? result.user.created_at.slice(0, 40) : '',
      email: typeof result.user.email === 'string' ? result.user.email.slice(0, 160) : '',
      emailConfirmed: Boolean(result.user.email_confirmed_at),
      id: String(result.user.id),
    },
  }
}

export const verifySupabaseUserInternals = {
  getBearerToken,
  getSupabaseServerConfig,
  mapAuthResult,
}
