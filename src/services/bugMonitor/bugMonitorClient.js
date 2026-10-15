import { supabase } from '../supabaseClient.js'

const FEATURES = new Set([
  'ai-coach',
  'ai-help',
  'app',
  'auth',
  'billing',
  'body-scan',
  'camera',
  'food-scan',
  'other',
])

const ERROR_TYPES = new Set([
  'ai-help',
  'auth',
  'chunkLoad',
  'conflict',
  'import',
  'network',
  'permission',
  'rateLimit',
  'render',
  'server',
  'storage',
  'timeout',
  'unknown',
  'validation',
])

function cleanToken(value, allow, fallback) {
  const text = String(value || '').trim()
  return allow.has(text) ? text : fallback
}

export function mapBugFeature(area) {
  const text = String(area || '').toLowerCase()
  if (text.includes('food') || text.includes('nutrition') || text.includes('meal')) return 'food-scan'
  if (text.includes('body')) return 'body-scan'
  if (text.includes('camera')) return 'camera'
  if (text.includes('coach')) return 'ai-coach'
  if (text.includes('help')) return 'ai-help'
  if (text.includes('billing') || text.includes('plan')) return 'billing'
  if (text.includes('auth')) return 'auth'
  return cleanToken(text, FEATURES, 'app')
}

export function buildClientBugPayload(input = {}) {
  const errorType = cleanToken(input.errorType, ERROR_TYPES, 'unknown')
  const fingerprint = String(input.fingerprint || `${errorType}-group`).trim().slice(0, 48)
  return {
    appVersion: String(import.meta.env?.VITE_APP_VERSION || 'unknown').slice(0, 32),
    errorType,
    feature: mapBugFeature(input.feature),
    fingerprint,
    occurredAt: new Date().toISOString(),
    severity: input.severity === 'high' || input.severity === 'low' ? input.severity : 'medium',
    source: input.source === 'ai-help' ? 'ai-help' : 'frontend',
  }
}

async function readAccessToken() {
  try {
    const session = await supabase?.auth?.getSession?.()
    return session?.data?.session?.access_token || ''
  } catch {
    return ''
  }
}

export async function reportClientBug(input, { fetchImpl = globalThis.fetch, force = false } = {}) {
  if (!force && !import.meta.env?.PROD) return { ok: false, reason: 'disabled' }
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'disabled' }
  const payload = buildClientBugPayload(input)
  try {
    const token = await readAccessToken()
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const response = await fetchImpl('/api/bug-monitor', {
      body: JSON.stringify(payload),
      headers,
      keepalive: true,
      method: 'POST',
    })
    return { ok: response?.ok === true }
  } catch {
    return { ok: false, reason: 'network' }
  }
}
