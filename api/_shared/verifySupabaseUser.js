import { createClient } from '@supabase/supabase-js'
import { aiRouteErrorCodes, makeSafeAiRouteError } from './aiRouteErrors.js'

const DEFAULT_AUTH_TIMEOUT_MS = 5000

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
    return {
      authenticated: false,
      ...makeAuthError(mapAuthResult(result.error), requestId),
    }
  }

  if (!result?.user?.id) {
    return {
      authenticated: false,
      ...makeAuthError('invalidSession', requestId),
    }
  }

  return {
    authenticated: true,
    user: {
      id: String(result.user.id),
    },
  }
}

export const verifySupabaseUserInternals = {
  getBearerToken,
  getSupabaseServerConfig,
  mapAuthResult,
}
