import { isWardrobeAiTarget, wardrobeAiConfig } from './wardrobeAiStaging.js'
// Ambiguous deployment identity is denied, never treated as an unrelated branch.
export const WARDROBE_BRANCH = 'feature/ai-eye-wardrobe-link-20261022'
export const WARDROBE_STAGING_REF = 'armtslzspuebmlysnooq'
export const WARDROBE_API_DISABLED = 'WARDROBE_STAGING_API_DISABLED'

export function isWardrobePreview(env = {}) {
  if (isWardrobeAiTarget(env)) return !wardrobeAiConfig(env)
  const marked = env.WARDROBE_LOCAL_A11Y_FIXTURE === 'true' || Object.keys(env).some((key) => key.startsWith('WARDROBE_STAGING_') && env[key])
  const branchIdentified = typeof env.VERCEL_GIT_COMMIT_REF === 'string' && Boolean(env.VERCEL_GIT_COMMIT_REF) && !/\s/.test(env.VERCEL_GIT_COMMIT_REF)
  return Boolean(marked || env.VERCEL_GIT_COMMIT_REF === WARDROBE_BRANCH ||
    !['preview', 'production', 'development'].includes(env.VERCEL_ENV) || !branchIdentified)
}

export function isWardrobeStagingUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === `${WARDROBE_STAGING_REF}.supabase.co` &&
      !url.port && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash
  } catch { return false }
}

function keyClaims(value) {
  try { return JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) } catch { return null }
}

export function isWardrobePublicKey(value) {
  if (typeof value !== 'string') return false
  if (/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(value)) return true
  const claims = keyClaims(value)
  // This inspects configuration metadata, never authenticates a user/JWT.
  return claims?.role === 'anon' && claims?.ref === WARDROBE_STAGING_REF
}

export function assertNoPublicServerKeys(env) {
  const serverKeys = Object.entries(env).filter(([key, value]) => !key.startsWith('VITE_') && /SECRET|SERVICE_ROLE|OPENAI_API_KEY/.test(key) && typeof value === 'string' && value.length >= 16).map(([, value]) => value)
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('VITE_') || !value) continue
    const claims = typeof value === 'string' ? keyClaims(value) : null
    if (/SECRET|SERVICE_ROLE|PASSWORD|OPENAI_API_KEY/.test(key) || String(value).includes('sb_secret_') ||
      claims?.role === 'service_role' || serverKeys.some((secret) => String(value).includes(secret))) {
      throw new Error('public_server_credential_blocked')
    }
  }
}

export function assertWardrobeStagingConfig(env = {}) {
  if (!isWardrobePreview(env)) return
  if (env.VERCEL_ENV !== 'preview' || env.VERCEL_GIT_COMMIT_REF !== WARDROBE_BRANCH ||
    env.WARDROBE_STAGING_BRANCH !== WARDROBE_BRANCH || env.WARDROBE_STAGING_PROJECT_REF !== WARDROBE_STAGING_REF) {
    throw new Error('wardrobe_staging_identity_invalid')
  }
  if (env.WARDROBE_STAGING_OFFLINE !== 'true' || env.WARDROBE_STAGING_AI_DISABLED !== 'true') {
    throw new Error('wardrobe_staging_offline_required')
  }
  if (!isWardrobeStagingUrl(env.WARDROBE_STAGING_SUPABASE_URL)) throw new Error('wardrobe_staging_target_invalid')
  if (!isWardrobePublicKey(env.WARDROBE_STAGING_ANON_KEY)) throw new Error('wardrobe_staging_public_key_invalid')
  const secret = env.WARDROBE_STAGING_SERVICE_ROLE_KEY
  const claims = typeof secret === 'string' ? keyClaims(secret) : null
  if (!(typeof secret === 'string' && /^sb_secret_[A-Za-z0-9_-]{16,}$/.test(secret)) &&
    !(claims?.role === 'service_role' && claims?.ref === WARDROBE_STAGING_REF)) {
    throw new Error('wardrobe_staging_secret_invalid')
  }
  if (secret === env.SUPABASE_SERVICE_ROLE_KEY || secret === env.SUPABASE_SERVICE_ROLE) {
    throw new Error('wardrobe_staging_global_secret_reused')
  }
  assertNoPublicServerKeys(env)
}

export function blockWardrobeApi(response, env = process.env, route = '') {
  if (isWardrobeAiTarget(env)) {
    if (wardrobeAiConfig(env) && ['object-bank-scan', 'analysis-consent'].includes(route)) return false
    response.setHeader('Cache-Control', 'no-store')
    response.status(503).json({ ok: false, error: { code: WARDROBE_API_DISABLED } })
    return true
  }
  if (!isWardrobePreview(env)) return false
  response.setHeader('Cache-Control', 'no-store')
  response.status(503).json({ ok: false, error: { code: WARDROBE_API_DISABLED } })
  return true
}
