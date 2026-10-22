// Fail-closed protection for the wardrobe Preview branch.
// Production and unrelated Preview branches retain their existing behavior.
export const WARDROBE_BRANCH = 'feature/ai-eye-wardrobe-link-20261022'
export const WARDROBE_STAGING_REF = 'armtslzspuebmlysnooq'

export function isWardrobePreview(env = {}) {
  return env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === WARDROBE_BRANCH
}

export function isWardrobeStagingUrl(value) {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      url.hostname === `${WARDROBE_STAGING_REF}.supabase.co` &&
      (url.pathname === '/' || url.pathname === '') &&
      !url.username && !url.password && !url.search && !url.hash
  } catch {
    return false
  }
}

export function assertWardrobeStagingConfig(env = {}) {
  if (!isWardrobePreview(env)) return
  const clientUrl = env.VITE_SUPABASE_URL
  const serverUrl = env.SUPABASE_URL
  const costUrl = env.AI_HELP_COST_SUPABASE_URL
  if (!isWardrobeStagingUrl(clientUrl) || !isWardrobeStagingUrl(serverUrl)) {
    throw new Error('wardrobe_staging_target_invalid')
  }
  if (!env.VITE_SUPABASE_ANON_KEY || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('wardrobe_staging_credentials_missing')
  }
  if (costUrl && !isWardrobeStagingUrl(costUrl)) {
    throw new Error('wardrobe_staging_cost_target_invalid')
  }
}
